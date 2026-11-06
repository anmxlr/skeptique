import type { HardhatRuntimeEnvironment } from "hardhat/types";

export type Address = `0x${string}`;

// Deploys every contract the local stack needs and returns name -> address.
// The local stack harness (packages/harness) calls this; ticket 08 adds the first contracts.
export async function deployLocal(_hre: HardhatRuntimeEnvironment): Promise<Record<string, Address>> {
  return {};
}
