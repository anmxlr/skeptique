// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

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
    uint256 public nextRoundId = 1;

    mapping(uint256 => Round) private rounds;
    mapping(uint256 => mapping(address => bytes32)) private commitments;
    mapping(uint256 => mapping(address => bool)) private committed;
    mapping(uint256 => mapping(address => bool)) private revealed;
    mapping(uint256 => uint8[]) private scores;
    mapping(uint256 => address[]) private revealers;
    mapping(uint256 => uint256) private openRoundPlusOne;

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
    error TooManyCritics();
    error TooFewReveals();
    error AlreadyFinalized();

    event RoundOpened(uint256 indexed roundId, uint256 indexed serviceId, uint64 commitEnd, uint64 revealEnd);
    event CriticCommitted(uint256 indexed roundId, address indexed critic);
    event CriticRevealed(uint256 indexed roundId, address indexed critic, uint8 score, bytes32 evidenceHash);
    event RoundFinalized(uint256 indexed roundId, uint256 indexed serviceId, uint8 median, uint8 nReveals, bool isVoid);

    constructor(uint64 commitSeconds_, uint64 revealSeconds_, uint8 kMin_, uint8 kMax_) {
        if (commitSeconds_ == 0 || revealSeconds_ == 0 || kMin_ == 0 || kMax_ < kMin_) revert InvalidConfiguration();
        commitSeconds = commitSeconds_;
        revealSeconds = revealSeconds_;
        kMin = kMin_;
        kMax = kMax_;
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
        committed[roundId][msg.sender] = true;
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
        round.median = _median(scores[roundId]);
        round.finalized = true;
        openRoundPlusOne[round.serviceId] = 0;
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

    function _median(uint8[] storage values) private view returns (uint8) {
        uint256 length = values.length;
        uint8[] memory ordered = new uint8[](length);
        for (uint256 i = 0; i < length; i++) {
            uint8 value = values[i];
            uint256 j = i;
            while (j > 0 && ordered[j - 1] > value) {
                ordered[j] = ordered[j - 1];
                j--;
            }
            ordered[j] = value;
        }
        if (length % 2 == 1) return ordered[length / 2];
        return uint8((uint256(ordered[length / 2 - 1]) + uint256(ordered[length / 2])) / 2);
    }
}
