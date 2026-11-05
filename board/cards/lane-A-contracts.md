# Lane A: contracts (`contracts/`)

## A-1 · ServiceRegistry and bounty escrow
- deps: T-01
- size: M
- tracks: Hedera
- read: spec/03-interfaces.md (Contracts), spec/02-mechanism.md §3 steps 1,6
- do: `listService`, `topUp`, `getService`, events, fee floor, bounty pool accounting; no seller withdrawal path. Hardhat tests first.
- done when: `pnpm --filter contracts test -- ServiceRegistry` passes (incl. fee below minimum reverts, seller cannot withdraw).

## A-2 · CriticRegistry (stake, voucher, one per human)
- deps: T-01
- size: M
- tracks: World, Hedera
- read: spec/03-interfaces.md (CriticRegistry), spec/02-mechanism.md §2,§6
- do: `registerCritic` with attestor-signature check (EIP-712 or EIP-191 over nullifier, sender, expiry, chainid), duplicate nullifier revert, seller-cannot-critique, withdraw with cooldown and open-round lock hooks.
- done when: tests pass for each revert named in the spec plus a valid registration.

## A-3 · RoundManager: commit and reveal
- deps: A-1, A-2
- size: M
- tracks: Hedera
- read: spec/03-interfaces.md (RoundManager), spec/02-mechanism.md §3 steps 2-3
- do: `openRound`, `commit`, `reveal` with commitment verification, window checks, slot cap `K_MAX`, events.
- done when: tests pass (wrong salt reverts, late reveal reverts, double commit reverts, slot cap holds).

## A-4 · RoundManager: finalise math, rewards, slashing
- deps: A-3
- size: M
- tracks: Hedera
- read: spec/02-mechanism.md §3 steps 4-6, §7
- do: stake-weighted median (ties to lower), tolerance check, reimbursement with cap, pro-rata reward and slashed-stake distribution, void-round path, no-reveal slash, `claim`. Property tests for every invariant in §7 (fast-check or Hardhat fuzz).
- done when: `pnpm --filter contracts test -- RoundManager` passes including property tests.

## A-5 · Deploy scripts for Hedera testnet and ABI export
- deps: A-4, S-01, H-01
- size: S
- read: spec/notes/hedera-x402.md (RPC and chain id), spec/03-interfaces.md
- do: deploy script, write `contracts/deployments/hedera-testnet.json`, export ABIs into `packages/shared/abi/`, verify what the explorer allows.
- done when: `pnpm --filter contracts deploy:hedera` prints addresses and a `listService` smoke call succeeds on testnet.

## A-6 · Check fixtures against real contracts
- deps: A-4
- size: S
- read: spec/03-interfaces.md
- do: run a local hardhat scenario, capture every emitted event, and diff against the hand-written fixtures in `packages/shared/fixtures/events/` (from T-01); fix whichever side is wrong and report any spec deviation in the receipt.
- done when: `pnpm --filter contracts test -- fixtures` passes (real events validate against shared schemas and match fixture shapes).
