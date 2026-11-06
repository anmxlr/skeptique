import type {} from "@nomicfoundation/hardhat-toolbox-viem";
import type { HardhatRuntimeEnvironment } from "hardhat/types";
import { DEFAULT_ROUND_CONFIG } from "../../packages/shared/src/index";

export type Address = `0x${string}`;

// Contract amounts are tinybars (spec/notes/hedera-x402.md); the local chain uses the same numbers.
const TINYBARS_PER_HBAR = 10n ** 8n;

// Deploys every contract the local stack needs and returns name -> address.
// The local stack harness (packages/harness) calls this.
export async function deployLocal(hre: HardhatRuntimeEnvironment): Promise<Record<string, Address>> {
  const minListingFee = BigInt(DEFAULT_ROUND_CONFIG.MIN_LISTING_FEE) * TINYBARS_PER_HBAR;
  const serviceRegistry = await hre.viem.deployContract("ServiceRegistry", [minListingFee]);
  // The local attestor is Hardhat's dev account #9; the seed signs vouchers with its key (ATTESTOR_PRIVATE_KEY).
  const attestor = (await hre.viem.getWalletClients())[9].account.address;
  const minStake = BigInt(DEFAULT_ROUND_CONFIG.S_MIN) * TINYBARS_PER_HBAR;
  const criticRegistry = await hre.viem.deployContract("CriticRegistry", [
    attestor,
    minStake,
    serviceRegistry.address,
    BigInt(DEFAULT_ROUND_CONFIG.WITHDRAW_COOLDOWN),
  ]);
  const roundManager = await hre.viem.deployContract("RoundManager", [
    BigInt(DEFAULT_ROUND_CONFIG.COMMIT_SECS), BigInt(DEFAULT_ROUND_CONFIG.REVEAL_SECS),
    DEFAULT_ROUND_CONFIG.K_MIN, DEFAULT_ROUND_CONFIG.K_MAX, criticRegistry.address,
    DEFAULT_ROUND_CONFIG.TOLERANCE, DEFAULT_ROUND_CONFIG.SLASH_BPS,
  ]);
  await criticRegistry.write.setRoundManager([roundManager.address]);
  return { ServiceRegistry: serviceRegistry.address, CriticRegistry: criticRegistry.address, RoundManager: roundManager.address };
}
