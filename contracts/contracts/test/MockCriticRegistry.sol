// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockCriticRegistry {
    mapping(address => uint256) public stakeOf;
    mapping(address => bool) public isCritic;
    mapping(uint256 => mapping(address => uint256)) public slashedInRound;
    mapping(address => uint256) public activeRound;
    mapping(uint256 => uint256) public releasedInRound;

    event CriticSlashed(address indexed critic, uint256 indexed roundId, uint256 amount, string reason);

    function setStake(address critic, uint256 amount) external {
        stakeOf[critic] = amount;
        isCritic[critic] = amount > 0;
    }

    function setRegistered(address critic, bool registered) external {
        isCritic[critic] = registered;
    }

    function slashStake(address critic, uint256 roundId, uint256 amount, string calldata reason) external {
        require(amount <= stakeOf[critic], 'slash exceeds stake');
        stakeOf[critic] -= amount;
        slashedInRound[roundId][critic] += amount;
        emit CriticSlashed(critic, roundId, amount, reason);
    }

    /// The mock holds no stake, so releasing slashed funds only records the amount.
    function releaseSlashed(uint256 roundId, uint256 amount) external {
        releasedInRound[roundId] += amount;
    }

    function lockStake(address critic, uint256 roundId) external {
        require(activeRound[critic] == 0, 'stake locked');
        activeRound[critic] = roundId;
    }

    function releaseStake(address critic, uint256 roundId) external {
        require(activeRound[critic] == roundId, 'wrong round');
        activeRound[critic] = 0;
    }
}
