import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import "@nomicfoundation/hardhat-ethers";
import fc from "fast-check";
import { ethers, network } from "hardhat";

const HBAR = 10n ** 8n;
const S_MIN = 5n * HBAR;
const LISTING_FEE = 20n * HBAR;
const K_MIN = 3;
const TOLERANCE = 10;
const SLASH_BPS = 2000n;
const WINDOW = 30;

async function reverted(operation: Promise<unknown>, reason: string) {
  try {
    await operation;
  } catch (error) {
    assert(String(error).includes(reason), `expected revert containing ${reason}, got ${String(error)}`);
    return;
  }
  assert.fail(`expected revert containing ${reason}`);
}

async function deploy(stakes: bigint[], fee = LISTING_FEE) {
  const [, attestor, seller, ...rest] = await ethers.getSigners();
  const critics = rest.slice(0, stakes.length);
  const services: any = await (await ethers.getContractFactory("ServiceRegistry")).deploy(LISTING_FEE);
  const registry: any = await (await ethers.getContractFactory("CriticRegistry")).deploy(
    attestor!.address,
    S_MIN,
    await services.getAddress(),
    300,
  );
  const manager: any = await (await ethers.getContractFactory("RoundManager")).deploy(
    WINDOW,
    WINDOW,
    K_MIN,
    7,
    await registry.getAddress(),
    TOLERANCE,
    SLASH_BPS,
  );
  await registry.setRoundManager(await manager.getAddress());
  await services.setRoundManager(await manager.getAddress());
  await manager.setServiceRegistry(await services.getAddress());
  const { chainId } = await ethers.provider.getNetwork();
  const expiry = BigInt((await ethers.provider.getBlock("latest"))!.timestamp) + 3600n;
  for (const [index, critic] of critics.entries()) {
    const nullifier = ethers.zeroPadValue(ethers.toBeHex(BigInt(Date.now()) * 100n + BigInt(index)), 32);
    const digest = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(
        ["bytes32", "address", "uint64", "uint256"],
        [nullifier, critic.address, expiry, chainId],
      ),
    );
    const sig = await attestor!.signMessage(ethers.getBytes(digest));
    await registry.connect(critic).registerCritic(nullifier, expiry, sig, { value: stakes[index]! });
  }
  await services.connect(seller).listService(ethers.ZeroHash, "https://svc.example", 1, ethers.ZeroHash, { value: fee });
  const roundId = (await manager.nextRoundId()) - 1n;
  const advance = async (seconds: number) => {
    await network.provider.send("evm_increaseTime", [seconds]);
    await network.provider.send("evm_mine");
  };
  const balance = async (contract: any) => ethers.provider.getBalance(await contract.getAddress());
  const held = async () => (await balance(services)) + (await balance(registry)) + (await balance(manager));
  /** Plays one round: each critic commits; those with `reveal` reveal score and claimed cost; then finalize. */
  const play = async (moves: { score: number; cost: bigint; reveal: boolean }[]) => {
    for (const [index, move] of moves.entries()) {
      const critic = critics[index]!;
      const salt = ethers.zeroPadValue(ethers.toBeHex(index + 1), 32);
      await manager
        .connect(critic)
        .commit(roundId, await manager.commitmentFor(move.score, salt, ethers.ZeroHash, critic.address));
    }
    await advance(WINDOW + 1);
    for (const [index, move] of moves.entries()) {
      if (!move.reveal) continue;
      const salt = ethers.zeroPadValue(ethers.toBeHex(index + 1), 32);
      await manager.connect(critics[index]!).reveal(roundId, move.score, salt, ethers.ZeroHash, move.cost);
    }
    await advance(WINDOW + 1);
    await manager.finalize(roundId);
  };
  return { seller: seller!, critics, services, registry, manager, roundId, play, held, balance };
}

describe("rewards: honest critics are paid", () => {
  it("reimburses capped test cost and shares the remaining bounty plus slashed stake pro rata by stake", async () => {
    const stakes = [10n * HBAR, 5n * HBAR, 5n * HBAR, 8n * HBAR, 6n * HBAR];
    const { critics, services, registry, manager, roundId, play } = await deploy(stakes);
    const cap: bigint = await manager.COST_CAP();
    const costs = [cap * 5n, cap / 2n, 0n, cap, cap];
    // Critics 0-2 are honest, 3 is an outlier, 4 commits and never reveals.
    await play([
      { score: 70, cost: costs[0]!, reveal: true },
      { score: 72, cost: costs[1]!, reveal: true },
      { score: 68, cost: costs[2]!, reveal: true },
      { score: 10, cost: costs[3]!, reveal: true },
      { score: 70, cost: costs[4]!, reveal: false },
    ]);
    const slashed = (stakes[3]! * SLASH_BPS) / 10_000n + (stakes[4]! * (await manager.NOREVEAL_SLASH_BPS())) / 10_000n;
    const reimbursed = [cap, cap / 2n, 0n];
    const pool = LISTING_FEE - (reimbursed[0]! + reimbursed[1]! + reimbursed[2]!) + slashed;
    const honestStake = stakes[0]! + stakes[1]! + stakes[2]!;
    let paid = 0n;
    for (const index of [0, 1, 2]) {
      const expected = reimbursed[index]! + (pool * stakes[index]!) / honestStake;
      assert.equal(await manager.pendingRewards(critics[index]!.address), expected);
      paid += expected;
    }
    assert.equal(await manager.pendingRewards(critics[3]!.address), 0n);
    assert.equal(await manager.pendingRewards(critics[4]!.address), 0n);
    // Rounding dust stays in the pools; nothing is created or lost.
    const bountyLeft = (await services.getService(1)).bounty;
    const slashedLeft = await registry.slashedFunds(roundId);
    assert.equal(paid + bountyLeft + slashedLeft, LISTING_FEE + slashed);
    assert(bountyLeft + slashedLeft < 3n, "only rounding dust is left");
  });

  it("emits RewardAccrued for every honest critic", async () => {
    const { critics, manager, roundId, play } = await deploy([S_MIN, S_MIN, S_MIN]);
    await play([
      { score: 50, cost: 0n, reveal: true },
      { score: 52, cost: 0n, reveal: true },
      { score: 54, cost: 0n, reveal: true },
    ]);
    const events = await manager.queryFilter(manager.filters.RewardAccrued(roundId));
    assert.deepEqual(
      events.map((event: any) => event.args.critic).sort(),
      critics.map((critic) => critic.address).sort(),
    );
  });
});

describe("claim: rewards are pulled", () => {
  it("claiming twice pays once", async () => {
    const { critics, manager, play } = await deploy([S_MIN, S_MIN, S_MIN]);
    await play([
      { score: 50, cost: 0n, reveal: true },
      { score: 52, cost: 0n, reveal: true },
      { score: 54, cost: 0n, reveal: true },
    ]);
    const critic = critics[0]!;
    const pending: bigint = await manager.pendingRewards(critic.address);
    assert(pending > 0n);
    const before = await ethers.provider.getBalance(critic.address);
    const receipt = await (await manager.connect(critic).claim()).wait();
    const after = await ethers.provider.getBalance(critic.address);
    assert.equal(after - before + receipt.gasUsed * receipt.gasPrice, pending);
    assert.equal(await manager.pendingRewards(critic.address), 0n);
    await reverted(manager.connect(critic).claim(), "NothingToClaim");
  });

  it("only the registries can pay into the round manager", async () => {
    const { seller, manager } = await deploy([S_MIN, S_MIN, S_MIN]);
    await reverted(seller.sendTransaction({ to: await manager.getAddress(), value: 1n }), "UnexpectedPayment");
  });
});

describe("invariant: spec/02 §7 reward properties", () => {
  it("conserves funds, never pays the seller and never pays a critic who did not reveal", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            stake: fc.bigInt({ min: S_MIN, max: 20n * HBAR }),
            score: fc.integer({ min: 0, max: 100 }),
            cost: fc.bigInt({ min: 0n, max: 3n * HBAR }),
            reveal: fc.boolean(),
          }),
          { minLength: K_MIN, maxLength: 7 },
        ),
        fc.bigInt({ min: LISTING_FEE, max: 40n * HBAR }),
        async (moves, fee) => {
          if (moves.filter((move) => move.reveal).length < K_MIN) moves.forEach((move) => (move.reveal = true));
          const stakes = moves.map((move) => move.stake);
          const { seller, critics, services, registry, manager, roundId, play, held, balance } = await deploy(
            stakes,
            fee,
          );
          const inputs = fee + stakes.reduce((sum, stake) => sum + stake, 0n);
          assert.equal(await held(), inputs);
          await play(moves);
          let pending = 0n;
          let staked = 0n;
          for (const [index, critic] of critics.entries()) {
            const reward: bigint = await manager.pendingRewards(critic.address);
            if (!moves[index]!.reveal) assert.equal(reward, 0n, "non-revealer paid");
            if (!(await manager.isHonest(roundId, critic.address))) assert.equal(reward, 0n, "outlier paid");
            pending += reward;
            staked += await registry.stakeOf(critic.address);
          }
          assert.equal(await manager.pendingRewards(seller.address), 0n);
          const bountyLeft: bigint = (await services.getService(1)).bounty;
          const slashedLeft: bigint = await registry.slashedFunds(roundId);
          // A round spends at most one listing fee; the rest stays for re-review rounds.
          assert(bountyLeft >= fee - LISTING_FEE);
          // Conservation: payouts + remaining = inputs, on the books and in native balances.
          assert.equal(pending + bountyLeft + slashedLeft + staked, inputs);
          assert.equal(await balance(manager), pending);
          assert.equal(await held(), inputs);
          // No seller withdrawal path: the seller cannot pull the bounty or the slashed pool.
          await reverted(services.connect(seller).releaseBounty(1, 1n), "NotRoundManager");
          await reverted(registry.connect(seller).releaseSlashed(roundId, 1n), "NotRoundManager");
          await reverted(manager.connect(seller).claim(), "NothingToClaim");
          for (const [index, critic] of critics.entries()) {
            if (!moves[index]!.reveal) await reverted(manager.connect(critic).claim(), "NothingToClaim");
          }
        },
      ),
      { numRuns: 12 },
    );
  });
});
