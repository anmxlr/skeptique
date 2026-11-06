import { strict as assert } from 'node:assert';
import { describe, it } from 'mocha';
import '@nomicfoundation/hardhat-ethers';
import { ethers, network } from 'hardhat';
import { scorePersona } from '../../apps/critic/src/personas';

describe('weighted median and slash settlement', () => {
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
