// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface ISellerLookup {
    function isSeller(address account) external view returns (bool);
}

/// Critics stake here. Registration needs an attestor-signed voucher over (nullifier, critic, expiry, chainid), so one
/// human backs one critic (spec/02 §6). Amounts are in the chain's native unit as seen by the EVM (tinybars on Hedera).
contract CriticRegistry {
    address public immutable attestor;
    uint256 public immutable minStake;
    ISellerLookup public immutable serviceRegistry;
    uint64 public immutable withdrawCooldown;
    address public immutable deployer;

    /// Set once by the deployer; the only caller allowed to slash.
    address public roundManager;

    mapping(address => uint256) public stakeOf;
    mapping(address => bool) public isCritic;
    mapping(bytes32 => bool) public nullifierUsed;
    mapping(address => uint64) public withdrawableAt;
    mapping(address => uint256) public activeRound;
    /// Slashed stake per round. Only the round manager can release it, to pay honest critics.
    mapping(uint256 => uint256) public slashedFunds;

    error DuplicateNullifier(bytes32 nullifier);
    error ExpiredVoucher(uint64 expiry);
    error BadSignature();
    error SellerCannotCritique(address account);
    error StakeTooLow(uint256 sent, uint256 minimum);
    error AlreadyRegistered(address critic);
    error NotCritic(address account);
    error WithdrawNotRequested();
    error WithdrawCooldown(uint64 availableAt);
    error NotRoundManager();
    error RoundManagerAlreadySet();
    error TransferFailed();
    error StakeLocked(uint256 roundId);
    error WrongRound();

    event CriticRegistered(address indexed critic, bytes32 nullifier, uint256 stake);
    event CriticSlashed(address indexed critic, uint256 indexed roundId, uint256 amount, string reason);

    constructor(address attestor_, uint256 minStake_, address serviceRegistry_, uint64 withdrawCooldown_) {
        attestor = attestor_;
        minStake = minStake_;
        serviceRegistry = ISellerLookup(serviceRegistry_);
        withdrawCooldown = withdrawCooldown_;
        deployer = msg.sender;
    }

    function setRoundManager(address roundManager_) external {
        if (msg.sender != deployer || roundManager != address(0)) revert RoundManagerAlreadySet();
        roundManager = roundManager_;
    }

    function registerCritic(bytes32 humanNullifier, uint64 expiry, bytes calldata sig) external payable {
        if (expiry < block.timestamp) revert ExpiredVoucher(expiry);
        if (!_signedByAttestor(humanNullifier, expiry, sig)) revert BadSignature();
        if (serviceRegistry.isSeller(msg.sender)) revert SellerCannotCritique(msg.sender);
        if (nullifierUsed[humanNullifier]) revert DuplicateNullifier(humanNullifier);
        if (isCritic[msg.sender]) revert AlreadyRegistered(msg.sender);
        if (msg.value < minStake) revert StakeTooLow(msg.value, minStake);
        nullifierUsed[humanNullifier] = true;
        isCritic[msg.sender] = true;
        stakeOf[msg.sender] = msg.value;
        emit CriticRegistered(msg.sender, humanNullifier, msg.value);
    }

    function requestWithdraw() external {
        if (!isCritic[msg.sender]) revert NotCritic(msg.sender);
        withdrawableAt[msg.sender] = uint64(block.timestamp) + withdrawCooldown;
    }

    function withdraw() external {
        if (activeRound[msg.sender] != 0) revert StakeLocked(activeRound[msg.sender]);
        uint64 availableAt = withdrawableAt[msg.sender];
        if (availableAt == 0) revert WithdrawNotRequested();
        if (block.timestamp < availableAt) revert WithdrawCooldown(availableAt);
        uint256 amount = stakeOf[msg.sender];
        stakeOf[msg.sender] = 0;
        isCritic[msg.sender] = false;
        withdrawableAt[msg.sender] = 0;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function slashStake(address critic, uint256 roundId, uint256 amount, string calldata reason) external {
        if (msg.sender != roundManager) revert NotRoundManager();
        if (activeRound[critic] != roundId || roundId == 0) revert WrongRound();
        stakeOf[critic] -= amount;
        slashedFunds[roundId] += amount;
        emit CriticSlashed(critic, roundId, amount, reason);
    }

    function releaseSlashed(uint256 roundId, uint256 amount) external {
        if (msg.sender != roundManager) revert NotRoundManager();
        slashedFunds[roundId] -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function lockStake(address critic, uint256 roundId) external {
        if (msg.sender != roundManager) revert NotRoundManager();
        if (!isCritic[critic]) revert NotCritic(critic);
        if (roundId == 0) revert WrongRound();
        if (activeRound[critic] != 0) revert StakeLocked(activeRound[critic]);
        activeRound[critic] = roundId;
    }

    function releaseStake(address critic, uint256 roundId) external {
        if (msg.sender != roundManager) revert NotRoundManager();
        if (activeRound[critic] != roundId || roundId == 0) revert WrongRound();
        activeRound[critic] = 0;
    }

    function _signedByAttestor(bytes32 humanNullifier, uint64 expiry, bytes calldata sig) private view returns (bool) {
        if (sig.length != 65) return false;
        bytes32 digest = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", keccak256(abi.encode(humanNullifier, msg.sender, expiry, block.chainid)))
        );
        bytes32 r = bytes32(sig[0:32]);
        bytes32 s = bytes32(sig[32:64]);
        uint8 v = uint8(sig[64]);
        if (v < 27) v += 27;
        // Reject malleable high-s signatures.
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) return false;
        address signer = ecrecover(digest, v, r, s);
        return signer != address(0) && signer == attestor;
    }
}
