import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import '@nomicfoundation/hardhat-ethers';
import { ethers, network } from 'hardhat';
import fc from 'fast-check';
import { scorePersona } from '../../apps/critic/src/personas';
import { weightedMedian } from '../../packages/shared/src/consensus';

describe('weighted median and slash settlement', () => {
  it('matches the reference median and moves monotonically on-chain', async function () {
    this.timeout(20_000);
    const signers = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('MockCriticRegistry')).deploy();
    const manager: any = await (await ethers.getContractFactory('RoundManager')).deploy(100, 100, 1, 7, await registry.getAddress(), 100, 2000);
    const settle = async (values: Array<{ score: number; weight: bigint }>) => {
      const roundId = await manager.nextRoundId();
      await manager.openRound(1);
      for (const [i, value] of values.entries()) {
        const critic = signers[i + 1]!;
        await registry.setStake(await critic.getAddress(), value.weight);
        await manager.connect(critic).commit(roundId, await manager.commitmentFor(value.score, ethers.ZeroHash, ethers.ZeroHash, await critic.getAddress()));
      }
      await network.provider.send('evm_increaseTime', [101]);
      await network.provider.send('evm_mine');
      for (const [i, value] of values.entries()) await manager.connect(signers[i + 1]!).reveal(roundId, value.score, ethers.ZeroHash, ethers.ZeroHash, 0);
      await network.provider.send('evm_increaseTime', [101]);
      await network.provider.send('evm_mine');
      await manager.finalize(roundId);
      const median = Number((await manager.getRound(roundId)).median);
      assert.equal(median, weightedMedian(values));
      return median;
    };
    const cases = fc.array(fc.record({ score: fc.integer({ min: 0, max: 100 }), weight: fc.bigInt({ min: 1n, max: 1000n }), delta: fc.integer({ min: 0, max: 100 }) }), { minLength: 3, maxLength: 7 });
    await fc.assert(fc.asyncProperty(cases, async values => {
      const before = await settle(values);
      const after = await settle(values.map(({ score, weight, delta }) => ({ score: Math.min(100, score + delta), weight })));
      assert(after >= before);
    }), { numRuns: 12, seed: 20261106 });
  });

  it('rejects a positive stake belonging to an unregistered critic', async () => {
    const [, critic] = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('MockCriticRegistry')).deploy();
    await registry.setStake(await critic!.getAddress(), 5);
    await registry.setRegistered(await critic!.getAddress(), false);
    const manager: any = await (await ethers.getContractFactory('RoundManager')).deploy(10, 30, 1, 7, await registry.getAddress(), 10, 2000);
    await manager.openRound(1);
    await assert.rejects(manager.connect(critic).commit(1, ethers.ZeroHash), /CriticNotRegistered/);
  });

  it('uses unequal stake weights instead of the unweighted middle score', async () => {
    const signers = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('MockCriticRegistry')).deploy();
    const values = [{ score: 20, weight: 1 }, { score: 60, weight: 1 }, { score: 90, weight: 5 }];
    const manager: any = await (await ethers.getContractFactory('RoundManager')).deploy(20, 30, 1, 7, await registry.getAddress(), 100, 2000);
    await manager.openRound(1);
    const evidence = ethers.ZeroHash;
    for (const [i, value] of values.entries()) {
      const critic = signers[i + 1]!;
      await registry.setStake(await critic.getAddress(), value.weight);
      await manager.connect(critic).commit(1, await manager.commitmentFor(value.score, evidence, evidence, await critic.getAddress()));
    }
    await network.provider.send('evm_increaseTime', [21]);
    await network.provider.send('evm_mine');
    for (const [i, value] of values.entries()) await manager.connect(signers[i + 1]!).reveal(1, value.score, evidence, evidence, 0);
    await network.provider.send('evm_increaseTime', [31]);
    await network.provider.send('evm_mine');
    await manager.finalize(1);
    assert.equal((await manager.getRound(1)).median, 90n);
  });

  it('uses stake weights, ties low, and slashes only outliers by the configured amount', async () => {
    const signers = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('MockCriticRegistry')).deploy();
    await registry.waitForDeployment();
    const weights = [5, 5, 5, 5, 5];
    for (let i = 0; i < weights.length; i++) await registry.setStake(await signers[i + 1]!.getAddress(), weights[i]);
    const manager: any = await (await ethers.getContractFactory('RoundManager')).deploy(10, 30, 1, 7, await registry.getAddress(), 10, 2000);
    await manager.waitForDeployment();
    const roundId = await manager.nextRoundId();
    await manager.openRound(1);

    const measured = [68, 72, 76, 72, 72];
    const personas = ['balanced', 'balanced', 'balanced', 'lazy-copier', 'bribed'] as const;
    const lazy = scorePersona(personas[3], measured[3]!, { lazyScore: 20 });
    const bribed = scorePersona(personas[4], measured[4]!);
    const scores = [measured[0]!, measured[1]!, measured[2]!, lazy.score, bribed.score];
    const salts = scores.map((_, i) => `0x${(i + 1).toString(16).padStart(64, '0')}`);
    const evidence = `0x${'aa'.repeat(32)}`;
    for (let i = 0; i < scores.length; i++) {
      const critic = signers[i + 1]!;
      const commitment = await manager.commitmentFor(scores[i], salts[i], evidence, await critic.getAddress());
      await manager.connect(critic).commit(roundId, commitment);
    }
    await network.provider.send('evm_increaseTime', [11]);
    await network.provider.send('evm_mine');
    for (let i = 0; i < scores.length; i++) await manager.connect(signers[i + 1]!).reveal(roundId, scores[i], salts[i], evidence, 0);
    await network.provider.send('evm_increaseTime', [31]);
    await network.provider.send('evm_mine');
    await manager.finalize(roundId);

    const round = await manager.getRound(roundId);
    assert.equal(round.median, 72n);
    assert.equal(await manager.isHonest(roundId, await signers[1]!.getAddress()), true);
    assert.equal(await manager.isHonest(roundId, await signers[2]!.getAddress()), true);
    assert.equal(await manager.isHonest(roundId, await signers[3]!.getAddress()), true);
    assert.equal(await manager.isHonest(roundId, await signers[4]!.getAddress()), false);
    assert.equal(await manager.isHonest(roundId, await signers[5]!.getAddress()), false);
    assert.equal(await registry.stakeOf(await signers[4]!.getAddress()), 4n);
    assert.equal(await registry.stakeOf(await signers[5]!.getAddress()), 4n);
    assert.equal(await registry.stakeOf(await signers[1]!.getAddress()), 5n);
    assert.equal(await registry.slashedInRound(roundId, await signers[4]!.getAddress()), 1n);
    assert.equal(await registry.slashedInRound(roundId, await signers[5]!.getAddress()), 1n);
  });

  it('chooses the lower score when exactly half of stake is on each side', async () => {
    const signers = await ethers.getSigners();
    const registry = await (await ethers.getContractFactory('MockCriticRegistry')).deploy();
    await registry.waitForDeployment();
    for (const signer of signers.slice(1, 3)) await registry.setStake(await signer.getAddress(), 5);
    const manager: any = await (await ethers.getContractFactory('RoundManager')).deploy(10, 30, 1, 7, await registry.getAddress(), 100, 2000);
    await manager.waitForDeployment();
    const id = await manager.nextRoundId();
    await manager.openRound(1);
    const tieSalts = [10, 11].map(value => `0x${value.toString(16).padStart(64, '0')}`);
    const tieScores = [40, 60];
    for (const [index, score] of tieScores.entries()) {
      const signer = signers[index + 1]!;
      const salt = tieSalts[index]!;
      const evidence = `0x${'bb'.repeat(32)}`;
      await manager.connect(signer).commit(id, await manager.commitmentFor(score, salt, evidence, await signer.getAddress()));
    }
    await network.provider.send('evm_increaseTime', [31]);
    await network.provider.send('evm_mine');
    for (const [index, score] of tieScores.entries()) {
      const signer = signers[index + 1]!;
      const salt = tieSalts[index]!;
      const evidence = `0x${'bb'.repeat(32)}`;
      await manager.connect(signer).reveal(id, score, salt, evidence, 0);
    }
    await network.provider.send('evm_increaseTime', [11]);
    await network.provider.send('evm_mine');
    await manager.finalize(id);
    assert.equal((await manager.getRound(id)).median, 40n);
  });
});
