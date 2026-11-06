import { expect } from "chai";
import hre from "hardhat";

describe("hardhat network", () => {
  it("serves a viem public client on the local chain", async () => {
    const client = await hre.viem.getPublicClient();
    expect(await client.getChainId()).to.equal(31337);
  });
});
