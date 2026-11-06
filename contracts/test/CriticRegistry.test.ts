import { strict as assert } from "node:assert";
import hre from "hardhat";
import { describe, it } from "mocha";
import { encodeAbiParameters, getAddress, keccak256, parseAbiParameters } from "viem";
import { criticRegisteredEvent, criticRegistryAbi } from "../../packages/shared/abi/CriticRegistry";
import { EventSchemas, eventFixtures } from "../../packages/shared/src/index";

const S_MIN = 5n * 10n ** 8n;
const LISTING_FEE = 20n * 10n ** 8n;
const WITHDRAW_COOLDOWN = 300n;
const nullifier = `0x${"aa".repeat(32)}` as const;
const otherNullifier = `0x${"bb".repeat(32)}` as const;

async function reverted(operation: Promise<unknown>, reason: string) {
  try {
    await operation;
  } catch (error) {
    assert(String(error).includes(reason), `expected revert containing ${reason}, got ${String(error)}`);
    return;
  }
  assert.fail(`expected revert containing ${reason}`);
}

async function deploy() {
  const [, attestor, critic, other, seller] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const serviceRegistry = await hre.viem.deployContract("ServiceRegistry", [LISTING_FEE]);
  const registry = await hre.viem.deployContract("CriticRegistry", [
    attestor.account.address,
    S_MIN,
    serviceRegistry.address,
    WITHDRAW_COOLDOWN,
  ]);
  const chainId = BigInt(await publicClient.getChainId());
  const now = async () => (await publicClient.getBlock()).timestamp;
  const voucher = (
    signer: typeof attestor,
    forNullifier: `0x${string}`,
    forCritic: `0x${string}`,
    expiry: bigint,
    forChain = chainId,
  ) =>
    signer.signMessage({
      message: {
        raw: keccak256(
          encodeAbiParameters(parseAbiParameters("bytes32, address, uint64, uint256"), [
            forNullifier,
            forCritic,
            expiry,
            forChain,
          ]),
        ),
      },
    });
  return { attestor, critic, other, seller, publicClient, serviceRegistry, registry, voucher, now };
}

describe("CriticRegistry", () => {
  it("slash collateral stays locked through settlement and its retained pool conserves funds", async () => {
    const { attestor, critic, other, registry, voucher, now, publicClient } = await deploy();
    const manager = await hre.viem.deployContract("RoundManager", [
      30n, 30n, 1, 7, registry.address, 10, 2000,
    ]);
    await registry.write.setRoundManager([manager.address]);
    const expiry = (await now()) + 3600n;
    for (const [index, account] of [critic, other].entries()) {
      const id = index === 0 ? nullifier : otherNullifier;
      await registry.write.registerCritic([id, expiry, await voucher(attestor, id, account.account.address, expiry)],
        { value: S_MIN, account: account.account });
    }
    const zero = `0x${"00".repeat(32)}` as const;
    await manager.write.openRound([1n]);
    await manager.write.openRound([2n]);
    for (const [account, score] of [[critic, 20], [other, 72]] as const) {
      const commitment = await manager.read.commitmentFor([score, zero, zero, account.account.address]);
      await manager.write.commit([1n, commitment], { account: account.account });
    }
    await reverted(manager.write.commit([2n, zero], { account: critic.account }), "StakeLocked");
    await reverted(registry.write.lockStake([critic.account.address, 2n], { account: critic.account }), "NotRoundManager");
    await reverted(registry.write.releaseStake([critic.account.address, 1n], { account: critic.account }), "NotRoundManager");
    await reverted(registry.write.slashStake([critic.account.address, 1n, 1n, "outlier"], { account: critic.account }), "NotRoundManager");
    await registry.write.requestWithdraw({ account: critic.account });
    const round = await manager.read.getRound([1n]);
    await hre.network.provider.send("evm_setNextBlockTimestamp", [Number(round.commitEnd)]);
    for (const [account, score] of [[critic, 20], [other, 72]] as const)
      await manager.write.reveal([1n, score, zero, zero, 0n], { account: account.account });
    await hre.network.provider.send("evm_increaseTime", [Number(WITHDRAW_COOLDOWN)]);
    await hre.network.provider.send("evm_mine");
    await reverted(registry.write.withdraw({ account: critic.account }), "StakeLocked");
    await manager.write.finalize([1n]);
    // Equal weight ties low, so the score 72 is the outlier in this two-critic regression.
    assert.equal(await registry.read.activeRound([critic.account.address]), 0n);
    assert.equal(await registry.read.activeRound([other.account.address]), 0n);
    assert.equal(await registry.read.slashedFunds([1n]), S_MIN / 5n);
    assert.equal(await registry.read.stakeOf([other.account.address]), S_MIN * 4n / 5n);
    assert.equal(await publicClient.getBalance({ address: registry.address }), S_MIN * 2n);
    await reverted(manager.write.finalize([1n]), "AlreadyFinalized");
    await registry.write.withdraw({ account: critic.account });
    assert.equal(await publicClient.getBalance({ address: registry.address }), S_MIN);
    assert.equal(await registry.read.slashedFunds([1n]), S_MIN / 5n);
  });

  it("registers a critic with a valid voucher and stake, and emits a CriticRegistered that matches the shared schema", async () => {
    const { attestor, critic, publicClient, registry, voucher, now } = await deploy();
    const expiry = (await now()) + 3600n;
    const sig = await voucher(attestor, nullifier, critic.account.address, expiry);
    await registry.write.registerCritic([nullifier, expiry, sig], { value: S_MIN, account: critic.account });

    assert.equal(await registry.read.stakeOf([critic.account.address]), S_MIN);
    assert.equal(await registry.read.isCritic([critic.account.address]), true);
    assert.equal(await publicClient.getBalance({ address: registry.address }), S_MIN);

    const [log] = await publicClient.getContractEvents({
      address: registry.address,
      abi: criticRegistryAbi,
      eventName: "CriticRegistered",
      fromBlock: 0n,
    });
    const event = criticRegisteredEvent(log.args);
    assert.deepEqual(EventSchemas.CriticRegistered.parse(event), event);
    assert.deepEqual(Object.keys(event).sort(), Object.keys(eventFixtures.CriticRegistered).sort());
    assert.deepEqual(event, { critic: getAddress(critic.account.address), nullifier, stake: S_MIN.toString() });
  });

  it("reverts a second critic for the same human nullifier", async () => {
    const { attestor, critic, other, registry, voucher, now } = await deploy();
    const expiry = (await now()) + 3600n;
    const register = async (account: typeof critic) =>
      registry.write.registerCritic(
        [nullifier, expiry, await voucher(attestor, nullifier, account.account.address, expiry)],
        { value: S_MIN, account: account.account },
      );
    await register(critic);
    await reverted(register(other), "DuplicateNullifier");
  });

  it("reverts an expired voucher", async () => {
    const { attestor, critic, registry, voucher, now } = await deploy();
    const expiry = (await now()) - 1n;
    await reverted(
      registry.write.registerCritic(
        [nullifier, expiry, await voucher(attestor, nullifier, critic.account.address, expiry)],
        { value: S_MIN, account: critic.account },
      ),
      "ExpiredVoucher",
    );
  });

  it("reverts a voucher not signed by the attestor, or bound to another critic, nullifier or chain", async () => {
    const { attestor, critic, other, registry, voucher, now } = await deploy();
    const expiry = (await now()) + 3600n;
    const register = (sig: `0x${string}`) =>
      registry.write.registerCritic([nullifier, expiry, sig], { value: S_MIN, account: critic.account });
    await reverted(register(await voucher(other, nullifier, critic.account.address, expiry)), "BadSignature");
    await reverted(register(await voucher(attestor, nullifier, other.account.address, expiry)), "BadSignature");
    await reverted(register(await voucher(attestor, otherNullifier, critic.account.address, expiry)), "BadSignature");
    await reverted(register(await voucher(attestor, nullifier, critic.account.address, expiry, 1n)), "BadSignature");
    await reverted(register("0x1234"), "BadSignature");
  });

  it("reverts an address that has listed a service", async () => {
    const { attestor, seller, serviceRegistry, registry, voucher, now } = await deploy();
    await serviceRegistry.write.listService(
      [`0x${"ab".repeat(32)}`, "http://127.0.0.1:1/call", 1n, `0x${"00".repeat(32)}`],
      { value: LISTING_FEE, account: seller.account },
    );
    const expiry = (await now()) + 3600n;
    await reverted(
      registry.write.registerCritic(
        [nullifier, expiry, await voucher(attestor, nullifier, seller.account.address, expiry)],
        { value: S_MIN, account: seller.account },
      ),
      "SellerCannotCritique",
    );
  });

  it("reverts a stake below the minimum", async () => {
    const { attestor, critic, registry, voucher, now } = await deploy();
    const expiry = (await now()) + 3600n;
    await reverted(
      registry.write.registerCritic(
        [nullifier, expiry, await voucher(attestor, nullifier, critic.account.address, expiry)],
        { value: S_MIN - 1n, account: critic.account },
      ),
      "StakeTooLow",
    );
  });
});
