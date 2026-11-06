// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MockCriticRegistry {
    mapping(address => uint256) public stakeOf;
    mapping(uint256 => mapping(address => uint256)) public slashedInRound;

    event CriticSlashed(address indexed critic, uint256 indexed roundId, uint256 amount, string reason);

    function setStake(address critic, uint256 amount) external {
        stakeOf[critic] = amount;
    }

    function slashStake(address critic, uint256 roundId, uint256 amount, string calldata reason) external {
        require(amount <= stakeOf[critic], 'slash exceeds stake');
        stakeOf[critic] -= amount;
        slashedInRound[roundId][critic] += amount;
        emit CriticSlashed(critic, roundId, amount, reason);
    }
}
