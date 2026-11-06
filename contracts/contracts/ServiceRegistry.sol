// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRoundOpener {
    function openRound(uint256 serviceId) external returns (uint256 roundId);
}

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
    address public immutable deployer;
    /// Set once by the deployer; listing a service opens its round 1 there.
    IRoundOpener public roundManager;

    mapping(uint256 => Service) private services;
    /// Addresses that have listed a service; CriticRegistry bars them from critiquing (spec/02 §6).
    mapping(address => bool) public isSeller;

    error FeeTooLow(uint256 sent, uint256 minimum);
    error UnknownService(uint256 serviceId);
    error AlreadySet();
    error NotRoundManager();
    error TransferFailed();

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
        deployer = msg.sender;
    }

    function setRoundManager(address roundManager_) external {
        if (msg.sender != deployer || address(roundManager) != address(0)) revert AlreadySet();
        roundManager = IRoundOpener(roundManager_);
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
        if (address(roundManager) != address(0)) roundManager.openRound(serviceId);
    }

    function topUp(uint256 serviceId) external payable {
        if (services[serviceId].seller == address(0)) revert UnknownService(serviceId);
        services[serviceId].bounty += msg.value;
        emit BountyToppedUp(serviceId, msg.value);
    }

    /// Pays honest-critic rewards out of the bounty into the round manager, which accrues them for `claim`.
    /// Only the round manager can call this, so the seller has no path to the bounty.
    function releaseBounty(uint256 serviceId, uint256 amount) external {
        if (msg.sender != address(roundManager)) revert NotRoundManager();
        services[serviceId].bounty -= amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
    }

    function getService(uint256 serviceId) external view returns (Service memory) {
        if (services[serviceId].seller == address(0)) revert UnknownService(serviceId);
        return services[serviceId];
    }
}
