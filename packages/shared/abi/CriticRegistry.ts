import { parseAbi } from "viem";
import { EventSchemas } from "../src/index";

/** CriticRegistry ABI (spec/03). Amounts are in the chain's native contract unit (tinybars on Hedera). */
export const criticRegistryAbi = parseAbi([
  "function registerCritic(bytes32 humanNullifier, uint64 expiry, bytes sig) payable",
  "function requestWithdraw()",
  "function withdraw()",
  "function stakeOf(address critic) view returns (uint256)",
  "function isCritic(address critic) view returns (bool)",
  "function minStake() view returns (uint256)",
  "function attestor() view returns (address)",
  "event CriticRegistered(address indexed critic, bytes32 nullifier, uint256 stake)",
  "event CriticSlashed(address indexed critic, uint256 indexed roundId, uint256 amount, string reason)",
  "error DuplicateNullifier(bytes32 nullifier)",
  "error ExpiredVoucher(uint64 expiry)",
  "error BadSignature()",
  "error SellerCannotCritique(address account)",
  "error StakeTooLow(uint256 sent, uint256 minimum)",
]);

/** Decoded CriticRegistered log args -> the shared event shape, validated. */
export function criticRegisteredEvent(args: { critic?: string; nullifier?: string; stake?: bigint }) {
  return EventSchemas.CriticRegistered.parse({
    critic: args.critic,
    nullifier: args.nullifier,
    stake: args.stake?.toString(),
  });
}
