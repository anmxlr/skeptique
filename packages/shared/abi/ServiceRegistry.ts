import { parseAbi } from "viem";
import { EventSchemas } from "../src/index";

/** ServiceRegistry ABI (spec/03). Amounts are in the chain's native contract unit (tinybars on Hedera). */
export const serviceRegistryAbi = parseAbi([
  "function listService(bytes32 specHash, string endpoint, uint256 pricePerCall, bytes32 ensNode) payable returns (uint256 serviceId)",
  "function topUp(uint256 serviceId) payable",
  "function getService(uint256 serviceId) view returns ((address seller, bytes32 specHash, string endpoint, uint256 pricePerCall, bytes32 ensNode, uint256 bounty))",
  "function minListingFee() view returns (uint256)",
  "function serviceCount() view returns (uint256)",
  "function isSeller(address account) view returns (bool)",
  "function deployer() view returns (address)",
  "function roundManager() view returns (address)",
  "function setRoundManager(address roundManager)",
  "function releaseBounty(uint256 serviceId, uint256 amount)",
  "event ServiceListed(uint256 indexed serviceId, address indexed seller, bytes32 specHash, string endpoint, uint256 pricePerCall, bytes32 ensNode)",
  "event BountyToppedUp(uint256 indexed serviceId, uint256 amount)",
  "error FeeTooLow(uint256 sent, uint256 minimum)",
  "error UnknownService(uint256 serviceId)",
  "error AlreadySet()",
  "error NotRoundManager()",
  "error TransferFailed()",
]);

type ServiceListedArgs = {
  serviceId?: bigint;
  seller?: string;
  specHash?: string;
  endpoint?: string;
  pricePerCall?: bigint;
  ensNode?: string;
};

/** Decoded ServiceListed log args -> the shared event shape, validated. */
export function serviceListedEvent(args: ServiceListedArgs) {
  return EventSchemas.ServiceListed.parse({
    serviceId: Number(args.serviceId),
    seller: args.seller,
    specHash: args.specHash,
    endpoint: args.endpoint,
    pricePerCall: args.pricePerCall?.toString(),
    ensNode: args.ensNode,
  });
}

/** Decoded BountyToppedUp log args -> the shared event shape, validated. */
export function bountyToppedUpEvent(args: { serviceId?: bigint; amount?: bigint }) {
  return EventSchemas.BountyToppedUp.parse({ serviceId: Number(args.serviceId), amount: args.amount?.toString() });
}
