// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// Sellers list services here. The listing fee is locked as the service's bounty; anyone can top it up and
/// nothing lets the seller take it back (spec/02 §3 steps 1 and 6). Amounts are in the chain's native unit
/// as seen by the EVM (tinybars on Hedera).
contract ServiceRegistry {
    struct Service {
        address seller;
        bytes32 specHash;
        string endpoint;
        uint256 pricePerCall;
        bytes32 ensNode;
        uint256 bounty;
    }

    uint256 public immutable minListingFee;
    uint256 public serviceCount;

    mapping(uint256 => Service) private services;
    /// Addresses that have listed a service; CriticRegistry bars them from critiquing (spec/02 §6).
    mapping(address => bool) public isSeller;

    error FeeTooLow(uint256 sent, uint256 minimum);
    error UnknownService(uint256 serviceId);

    event ServiceListed(
        uint256 indexed serviceId,
        address indexed seller,
        bytes32 specHash,
        string endpoint,
        uint256 pricePerCall,
        bytes32 ensNode
    );
    event BountyToppedUp(uint256 indexed serviceId, uint256 amount);

    constructor(uint256 minListingFee_) {
        minListingFee = minListingFee_;
    }

    function listService(bytes32 specHash, string calldata endpoint, uint256 pricePerCall, bytes32 ensNode)
        external
        payable
        returns (uint256 serviceId)
    {
        if (msg.value < minListingFee) revert FeeTooLow(msg.value, minListingFee);
        serviceId = ++serviceCount;
        isSeller[msg.sender] = true;
        services[serviceId] = Service(msg.sender, specHash, endpoint, pricePerCall, ensNode, msg.value);
        emit ServiceListed(serviceId, msg.sender, specHash, endpoint, pricePerCall, ensNode);
    }

    function topUp(uint256 serviceId) external payable {
        if (services[serviceId].seller == address(0)) revert UnknownService(serviceId);
        services[serviceId].bounty += msg.value;
        emit BountyToppedUp(serviceId, msg.value);
    }

    function getService(uint256 serviceId) external view returns (Service memory) {
        if (services[serviceId].seller == address(0)) revert UnknownService(serviceId);
        return services[serviceId];
    }
}
