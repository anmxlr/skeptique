import { strict as assert } from "node:assert";
import hre from "hardhat";
import { describe, it } from "mocha";
import { formatAbiItem } from "viem/utils";
import { bountyToppedUpEvent, serviceListedEvent, serviceRegistryAbi } from "../../packages/shared/abi/ServiceRegistry";
import { EventSchemas, eventFixtures } from "../../packages/shared/src/index";

const MIN_FEE = 20n * 10n ** 8n;
const specHash = `0x${"ab".repeat(32)}` as const;
const ensNode = `0x${"00".repeat(32)}` as const;
const endpoint = "http://127.0.0.1:4001/call";

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
  const registry = await hre.viem.deployContract("ServiceRegistry", [MIN_FEE]);
  const [, seller, other] = await hre.viem.getWalletClients();
  const publicClient = await hre.viem.getPublicClient();
  const getService = (serviceId: bigint) =>
    publicClient.readContract({
      address: registry.address,
      abi: serviceRegistryAbi,
      functionName: "getService",
      args: [serviceId],
    });
  return { registry, seller, other, publicClient, getService };
}

function sortedKeys(value: object) {
  return Object.keys(value).sort();
}

describe("ServiceRegistry", () => {
  it("locks the listing fee as the service's bounty and emits a ServiceListed that matches the shared schema", async () => {
    const { registry, seller, publicClient, getService } = await deploy();
    await registry.write.listService([specHash, endpoint, 1n, ensNode], { value: MIN_FEE, account: seller.account });

    const service = await getService(1n);
    assert.equal(service.seller.toLowerCase(), seller.account.address.toLowerCase());
    assert.equal(service.specHash, specHash);
    assert.equal(service.endpoint, endpoint);
    assert.equal(service.pricePerCall, 1n);
    assert.equal(service.bounty, MIN_FEE);
    assert.equal(await publicClient.getBalance({ address: registry.address }), MIN_FEE);

    const [log] = await publicClient.getContractEvents({
      address: registry.address,
      abi: serviceRegistryAbi,
      eventName: "ServiceListed",
      fromBlock: 0n,
    });
    const event = serviceListedEvent(log.args);
    assert.deepEqual(EventSchemas.ServiceListed.parse(event), event);
    assert.deepEqual(sortedKeys(event), sortedKeys(eventFixtures.ServiceListed));
    assert.equal(event.serviceId, 1);
    assert.equal(event.pricePerCall, "1");
  });

  it("reverts a listing whose fee is below the minimum", async () => {
    const { registry, seller } = await deploy();
    await reverted(
      registry.write.listService([specHash, endpoint, 1n, ensNode], { value: MIN_FEE - 1n, account: seller.account }),
      "FeeTooLow",
    );
  });

  it("adds a top-up to the bounty and emits a BountyToppedUp that matches the shared schema", async () => {
    const { registry, seller, other, publicClient, getService } = await deploy();
    await registry.write.listService([specHash, endpoint, 1n, ensNode], { value: MIN_FEE, account: seller.account });
    await registry.write.topUp([1n], { value: 5n, account: seller.account });
    await registry.write.topUp([1n], { value: 7n, account: other.account });

    assert.equal((await getService(1n)).bounty, MIN_FEE + 12n);
    const logs = await publicClient.getContractEvents({
      address: registry.address,
      abi: serviceRegistryAbi,
      eventName: "BountyToppedUp",
      fromBlock: 0n,
    });
    const events = logs.map((log) => bountyToppedUpEvent(log.args));
    for (const event of events) {
      assert.deepEqual(EventSchemas.BountyToppedUp.parse(event), event);
      assert.deepEqual(sortedKeys(event), sortedKeys(eventFixtures.BountyToppedUp));
    }
    assert.deepEqual(events, [
      { serviceId: 1, amount: "5" },
      { serviceId: 1, amount: "7" },
    ]);
  });

  it("reverts a top-up for a service that was never listed", async () => {
    const { registry, seller } = await deploy();
    await reverted(registry.write.topUp([1n], { value: 5n, account: seller.account }), "UnknownService");
  });

  it("gives the seller no call that withdraws the bounty", async () => {
    const { registry, seller, publicClient } = await deploy();
    await registry.write.listService([specHash, endpoint, 1n, ensNode], { value: MIN_FEE, account: seller.account });

    // Every state-changing function only takes money in.
    const artifact = await hre.artifacts.readArtifact("ServiceRegistry");
    const writes = artifact.abi.filter(
      (item: { type: string; stateMutability?: string }) =>
        item.type === "function" && item.stateMutability !== "view" && item.stateMutability !== "pure",
    );
    assert.deepEqual(writes.map((item: { name: string }) => item.name).sort(), ["listService", "topUp"]);
    assert(writes.every((item: { stateMutability: string }) => item.stateMutability === "payable"));
    assert(!artifact.abi.some((item: { type: string }) => item.type === "receive" || item.type === "fallback"));

    // Unknown selectors (e.g. withdraw()) and plain transfers revert.
    await reverted(seller.sendTransaction({ to: registry.address, data: "0x3ccfd60b" }), "revert");
    await reverted(seller.sendTransaction({ to: registry.address, value: 1n }), "revert");
    assert.equal(await publicClient.getBalance({ address: registry.address }), MIN_FEE);
  });

  it("matches the ABI exported from packages/shared", async () => {
    const artifact = await hre.artifacts.readArtifact("ServiceRegistry");
    const compiled = artifact.abi
      .filter((item: { type: string }) => item.type !== "constructor")
      .map((item) => formatAbiItem(item));
    assert.deepEqual(serviceRegistryAbi.map((item) => formatAbiItem(item)).sort(), compiled.sort());
  });
});
