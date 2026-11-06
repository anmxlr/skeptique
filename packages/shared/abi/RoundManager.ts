import { parseAbi } from "viem";

/** RoundManager ABI (spec/03), the subset clients need: open, commit, reveal, finalise, and the lifecycle events. */
export const roundManagerAbi = parseAbi([
  "function openRound(uint256 serviceId) returns (uint256 roundId)",
  "function commit(uint256 roundId, bytes32 commitment)",
  "function reveal(uint256 roundId, uint8 score, bytes32 salt, bytes32 evidenceHash, uint256 claimedCost)",
  "function finalize(uint256 roundId)",
  "function hasCommitted(uint256 roundId, address critic) view returns (bool)",
  "function hasRevealed(uint256 roundId, address critic) view returns (bool)",
  "function isHonest(uint256 roundId, address critic) view returns (bool)",
  "function nextRoundId() view returns (uint256)",
  "event RoundOpened(uint256 indexed roundId, uint256 indexed serviceId, uint64 commitEnd, uint64 revealEnd)",
  "event CriticCommitted(uint256 indexed roundId, address indexed critic)",
  "event CriticRevealed(uint256 indexed roundId, address indexed critic, uint8 score, bytes32 evidenceHash)",
  "event RoundFinalized(uint256 indexed roundId, uint256 indexed serviceId, uint8 median, uint8 nReveals, bool isVoid)",
]);
