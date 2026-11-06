import "tsx/cjs";
import "@nomicfoundation/hardhat-toolbox-viem";
import "@nomicfoundation/hardhat-ethers";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { HardhatUserConfig } from "hardhat/config";

// hardhat-viem writes artifacts/artifacts.d.ts even when there is nothing to compile.
mkdirSync(join(__dirname, "artifacts"), { recursive: true });

const config: HardhatUserConfig = {
  solidity: "0.8.24",
};

export default config;
