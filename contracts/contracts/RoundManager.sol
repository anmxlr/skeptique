// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ICriticStakeRegistry {
    function stakeOf(address critic) external view returns (uint256);
    function isCritic(address critic) external view returns (bool);
    function slashStake(address critic, uint256 roundId, uint256 amount, string calldata reason) external;
}

contract RoundManager {
    struct Round {
        uint256 serviceId;
        uint64 commitEnd;
        uint64 revealEnd;
        uint8 median;
        uint8 nReveals;
        bool finalized;
    }

    uint64 public immutable commitSeconds;
    uint64 public immutable revealSeconds;
    uint8 public immutable kMin;
    uint8 public immutable kMax;
    uint8 public immutable tolerance;
    uint16 public immutable slashBps;
    ICriticStakeRegistry public immutable criticRegistry;
    uint256 public nextRoundId = 1;

    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => bytes32)) private commitments;
    mapping(uint256 => mapping(address => bool)) private committed;
    mapping(uint256 => mapping(address => uint256)) private stakeAtCommit;
    mapping(uint256 => mapping(address => bool)) private revealed;
    mapping(uint256 => uint8[]) private scores;
    mapping(uint256 => address[]) private revealers;
    mapping(uint256 => uint256) private openRoundPlusOne;
    mapping(uint256 => mapping(address => bool)) private honestCritic;
    mapping(uint256 => mapping(address => uint256)) public slashedAmount;

    error InvalidConfiguration();
    error InvalidService();
    error RoundAlreadyOpen();
    error NoOpenRound();
    error CommitPhaseActive();
    error CommitPhaseClosed();
    error RevealPhaseActive();
    error RevealWindowClosed();
    error AlreadyCommitted();
    error NotCommitted();
    error AlreadyRevealed();
    error CommitmentMismatch();
    error ScoreOutOfRange();
    error CriticHasNoStake();
    error CriticNotRegistered();
    error TooManyCritics();
    error TooFewReveals();
    error AlreadyFinalized();

    event RoundOpened(uint256 indexed roundId, uint256 indexed serviceId, uint64 commitEnd, uint64 revealEnd);
    event CriticCommitted(uint256 indexed roundId, address indexed critic);
    event CriticRevealed(uint256 indexed roundId, address indexed critic, uint8 score, bytes32 evidenceHash);
    event RoundFinalized(uint256 indexed roundId, uint256 indexed serviceId, uint8 median, uint8 nReveals, bool isVoid);

    constructor(uint64 commitSeconds_, uint64 revealSeconds_, uint8 kMin_, uint8 kMax_, address criticRegistry_, uint8 tolerance_, uint16 slashBps_) {
        if (commitSeconds_ == 0 || revealSeconds_ == 0 || kMin_ == 0 || kMax_ < kMin_ || criticRegistry_ == address(0) || tolerance_ > 100 || slashBps_ > 10_000) revert InvalidConfiguration();
        commitSeconds = commitSeconds_;
        revealSeconds = revealSeconds_;
        kMin = kMin_;
        kMax = kMax_;
        criticRegistry = ICriticStakeRegistry(criticRegistry_);
        tolerance = tolerance_;
        slashBps = slashBps_;
    }

    function openRound(uint256 serviceId) external returns (uint256 roundId) {
        if (serviceId == 0) revert InvalidService();
        uint256 existing = openRoundPlusOne[serviceId];
        if (existing != 0 && !rounds[existing - 1].finalized) revert RoundAlreadyOpen();
        roundId = nextRoundId++;
        uint64 commitEnd = uint64(block.timestamp + commitSeconds);
        uint64 revealEnd = uint64(uint256(commitEnd) + revealSeconds);
        rounds[roundId] = Round({serviceId: serviceId, commitEnd: commitEnd, revealEnd: revealEnd, median: 0, nReveals: 0, finalized: false});
        openRoundPlusOne[serviceId] = roundId + 1;
        emit RoundOpened(roundId, serviceId, commitEnd, revealEnd);
    }

    function commitmentFor(uint8 score, bytes32 salt, bytes32 evidenceHash, address critic) external pure returns (bytes32) {
        return keccak256(abi.encode(score, salt, evidenceHash, critic));
    }

    function commit(uint256 roundId, bytes32 commitment) external {
        Round storage round = _round(roundId);
        if (block.timestamp >= round.commitEnd) revert CommitPhaseClosed();
        if (committed[roundId][msg.sender]) revert AlreadyCommitted();
        if (_committedCount(roundId) >= kMax) revert TooManyCritics();
        if (!criticRegistry.isCritic(msg.sender)) revert CriticNotRegistered();
        uint256 stake = criticRegistry.stakeOf(msg.sender);
        if (stake == 0) revert CriticHasNoStake();
        committed[roundId][msg.sender] = true;
        stakeAtCommit[roundId][msg.sender] = stake;
        commitments[roundId][msg.sender] = commitment;
        commitCount[roundId]++;
        emit CriticCommitted(roundId, msg.sender);
    }

    function reveal(uint256 roundId, uint8 score, bytes32 salt, bytes32 evidenceHash, uint256) external {
        Round storage round = _round(roundId);
        if (block.timestamp < round.commitEnd) revert CommitPhaseActive();
        if (block.timestamp >= round.revealEnd) revert RevealWindowClosed();
        if (score > 100) revert ScoreOutOfRange();
        if (!committed[roundId][msg.sender]) revert NotCommitted();
        if (revealed[roundId][msg.sender]) revert AlreadyRevealed();
        if (commitments[roundId][msg.sender] != keccak256(abi.encode(score, salt, evidenceHash, msg.sender))) revert CommitmentMismatch();
        revealed[roundId][msg.sender] = true;
        scores[roundId].push(score);
        revealers[roundId].push(msg.sender);
        round.nReveals++;
        emit CriticRevealed(roundId, msg.sender, score, evidenceHash);
    }

    function finalize(uint256 roundId) external {
        Round storage round = _round(roundId);
        if (block.timestamp < round.revealEnd) revert RevealPhaseActive();
        if (round.finalized) revert AlreadyFinalized();
        if (round.nReveals < kMin) revert TooFewReveals();
        round.median = _weightedMedian(roundId);
        round.finalized = true;
        openRoundPlusOne[round.serviceId] = 0;
        address[] storage critics = revealers[roundId];
        for (uint256 i = 0; i < critics.length; i++) {
            address critic = critics[i];
            uint256 stake = stakeAtCommit[roundId][critic];
            uint8 score = _scoreFor(roundId, critic);
            uint256 distance = score > round.median ? score - round.median : round.median - score;
            if (distance <= tolerance) {
                honestCritic[roundId][critic] = true;
            } else {
                uint256 amount = stake * slashBps / 10_000;
                if (amount > 0) {
                    slashedAmount[roundId][critic] = amount;
                    criticRegistry.slashStake(critic, roundId, amount, 'outlier');
                }
            }
        }
        emit RoundFinalized(roundId, round.serviceId, round.median, round.nReveals, false);
    }

    function getRound(uint256 roundId) external view returns (Round memory) {
        return rounds[roundId];
    }

    function hasCommitted(uint256 roundId, address critic) external view returns (bool) {
        return committed[roundId][critic];
    }

    function hasRevealed(uint256 roundId, address critic) external view returns (bool) {
        return revealed[roundId][critic];
    }

    function isHonest(uint256 roundId, address critic) external view returns (bool) {
        return honestCritic[roundId][critic];
    }

    function _round(uint256 roundId) private view returns (Round storage round) {
        round = rounds[roundId];
        if (round.serviceId == 0) revert NoOpenRound();
        if (round.finalized) revert AlreadyFinalized();
    }

    function _committedCount(uint256 roundId) private view returns (uint256 count) {
        // Each round caps commits at kMax; the count is tracked by a compact array of revealers
        // only after reveal, so use a dedicated per-round counter for commit admission.
        count = commitCount[roundId];
    }

    mapping(uint256 => uint8) private commitCount;

    function _scoreFor(uint256 roundId, address critic) private view returns (uint8) {
        address[] storage critics = revealers[roundId];
        for (uint256 i = 0; i < critics.length; i++) if (critics[i] == critic) return scores[roundId][i];
        revert NotCommitted();
    }

    function _weightedMedian(uint256 roundId) private view returns (uint8) {
        uint8[] storage values = scores[roundId];
        uint256 length = values.length;
        uint8[] memory ordered = new uint8[](length);
        uint256[] memory weights = new uint256[](length);
        uint256 totalWeight;
        for (uint256 i = 0; i < length; i++) {
            uint8 value = values[i];
            uint256 weight = stakeAtCommit[roundId][revealers[roundId][i]];
            if (weight == 0) revert CriticHasNoStake();
            totalWeight += weight;
            uint256 j = i;
            while (j > 0 && ordered[j - 1] > value) {
                ordered[j] = ordered[j - 1];
                weights[j] = weights[j - 1];
                j--;
            }
            ordered[j] = value;
            weights[j] = weight;
        }
        uint256 cumulative;
        for (uint256 i = 0; i < length; i++) {
            cumulative += weights[i];
            if (cumulative * 2 >= totalWeight) return ordered[i];
        }
        revert CriticHasNoStake();
    }
}
