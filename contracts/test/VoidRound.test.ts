import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import "@nomicfoundation/hardhat-ethers";
import { ethers, network } from "hardhat";

const STAKE = 1000n;

async function setup(kMin = 3) {
  const signers = await ethers.getSigners();
  const registry: any = await (await ethers.getContractFactory("MockCriticRegistry")).deploy();
  const manager: any = await (await ethers.getContractFactory("RoundManager")).deploy(
    10,
    10,
    kMin,
    7,
    await registry.getAddress(),
    10,
    2000,
  );
  const critics = signers.slice(1, 6);
  for (const critic of critics) await registry.setStake(await critic.getAddress(), STAKE);
  const advance = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  };
  const commit = async (roundId: bigint, critic: (typeof critics)[number], score: number) =>
    manager
      .connect(critic)
      .commit(roundId, await manager.commitmentFor(score, ethers.ZeroHash, ethers.ZeroHash, await critic.getAddress()));
  const reveal = (roundId: bigint, critic: (typeof critics)[number], score: number) =>
    manager.connect(critic).reveal(roundId, score, ethers.ZeroHash, ethers.ZeroHash, 0);
  return { registry, manager, critics, advance, commit, reveal };
}

describe("void round", () => {
  it("is void with zero commits: no score, round closes and the service can reopen", async () => {
    const { manager, advance } = await setup();
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);
    await advance(21);
    const receipt = await (await manager.finalize(roundId)).wait();
    const event = receipt.logs
      .map((log: any) => manager.interface.parseLog(log))
      .find((parsed: any) => parsed?.name === "RoundFinalized");
    assert.equal(event.args.isVoid, true);
    assert.equal(event.args.nReveals, 0n);
    const round = await manager.getRound(roundId);
    assert.equal(round.finalized, true);
    assert.equal(round.median, 0n);
    await manager.openRound(1);
  });

  it("slashes only non-revealers by exactly the no-reveal rate and releases every committer", async () => {
    const { registry, manager, critics, advance, commit, reveal } = await setup();
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);
    for (const [i, critic] of critics.slice(0, 4).entries()) await commit(roundId, critic, 50 + i);
    await advance(11);
    await reveal(roundId, critics[0]!, 50);
    await reveal(roundId, critics[1]!, 51);
    await advance(11);
    const receipt = await (await manager.finalize(roundId)).wait();
    const event = receipt.logs
      .map((log: any) => manager.interface.parseLog(log))
      .find((parsed: any) => parsed?.name === "RoundFinalized");
    assert.equal(event.args.isVoid, true);
    assert.equal(event.args.nReveals, 2n);
    const noRevealSlash = (STAKE * (await manager.NOREVEAL_SLASH_BPS())) / 10_000n;
    assert.equal(noRevealSlash, 100n);
    for (const critic of critics.slice(0, 2)) {
      const address = await critic.getAddress();
      assert.equal(await registry.stakeOf(address), STAKE);
      assert.equal(await registry.slashedInRound(roundId, address), 0n);
    }
    for (const critic of critics.slice(2, 4)) {
      const address = await critic.getAddress();
      assert.equal(await registry.stakeOf(address), STAKE - noRevealSlash);
      assert.equal(await registry.slashedInRound(roundId, address), noRevealSlash);
    }
    for (const critic of critics.slice(0, 4)) assert.equal(await registry.activeRound(await critic.getAddress()), 0n);
  });

  it("finalising a void round again changes nothing", async () => {
    const { registry, manager, critics, advance, commit } = await setup();
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);
    await commit(roundId, critics[0]!, 40);
    await advance(21);
    await manager.finalize(roundId);
    const address = await critics[0]!.getAddress();
    const stake = await registry.stakeOf(address);
    assert.equal(stake, STAKE - 100n);
    await assert.rejects(manager.finalize(roundId), /AlreadyFinalized/);
    assert.equal(await registry.stakeOf(address), stake);
    assert.equal(await registry.slashedInRound(roundId, address), 100n);
  });

  it("lets every committer commit to another round and the service open its next round", async () => {
    const { manager, critics, advance, commit, reveal } = await setup();
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);
    for (const critic of critics.slice(0, 3)) await commit(roundId, critic, 60);
    await advance(11);
    await reveal(roundId, critics[0]!, 60);
    await advance(11);
    await manager.finalize(roundId);
    const next = await manager.nextRoundId();
    await manager.openRound(1);
    for (const critic of critics.slice(0, 3)) await commit(next, critic, 70);
    for (const critic of critics.slice(0, 3))
      assert.equal(await manager.hasCommitted(next, await critic.getAddress()), true);
  });

  it("still publishes a score when reveals reach K_MIN", async () => {
    const { manager, critics, advance, commit, reveal } = await setup(2);
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);
    for (const critic of critics.slice(0, 2)) await commit(roundId, critic, 60);
    await advance(11);
    for (const critic of critics.slice(0, 2)) await reveal(roundId, critic, 60);
    await advance(11);
    const receipt = await (await manager.finalize(roundId)).wait();
    const event = receipt.logs
      .map((log: any) => manager.interface.parseLog(log))
      .find((parsed: any) => parsed?.name === "RoundFinalized");
    assert.equal(event.args.isVoid, false);
    assert.equal(event.args.median, 60n);
  });
});
