# ENS note: ENSv2 on Sepolia (ticket 03: phase A research, phase B live run)

Researched 2026-11-06. Sources are ENS's own: docs.ens.domains, the ENSIPs, `ensdomains/contracts-v2` source, and the ENS blog. "On-chain read" means an `eth_call` against Sepolia (chain 11155111) on 2026-11-06. Phase A sent no transactions; phase B (section "Phase B result") ran the plan live on Sepolia.

Source pin: the docs deployments page links every Sepolia ENSv2 ABI to `ensdomains/contracts-v2` commit **`07e55a056f5b6a9c90119f501bdd05714e67dddd`** (`contracts/deployments/sepolia/.deployment.json`: `deployedAt 2026-10-01`). Below, `SRC` means `https://github.com/ensdomains/contracts-v2/blob/07e55a056f5b6a9c90119f501bdd05714e67dddd/contracts/`.
**Do not code against `main`.** `main` (HEAD `48b3e2d3`, 2026-07-03) has a different, older-looking `PermissionedResolver` API (`setText(bytes32 node,…)`, `authorizeTextRoles`, per-name resources) and an older Sepolia address set. The live implementation matches `07e55a05`: calling `decodeSetter` on the live impl returned `resource = keccak256(key)`.

## TL;DR
- **Yes. ENSv2 is live and usable on Sepolia L1 today** (not Namechain). The public Universal Resolver `0xeEeE…EeEe` resolves through it. `.eth` registration is open and costs about 8 MockUSDC/year, and MockUSDC can be minted by anyone for free.
- **Recommended parent name: `skeptique.eth`.** `isAvailable("skeptique")` returned `true` on 2026-11-06.
- **spec/03 works with one structural addition.** Permissioned Resolver roles are scoped **per text key, not per name**. So "seller writes only `url`/`description` on their own subname" needs **one resolver per service subname**. The records themselves are fine.
- Also recommended: rename `skeptique.*` keys to the ENSIP-5 service-key form `eth.skeptique.*`.
- The ENSv1/NameWrapper fallback was **ruled out by the user**: ENSv2 only.

## 1. Is ENSv2 deployed and usable on Sepolia? Addresses
- docs.ens.domains/learn/deployments (section "Sepolia (ENSv2)") says Sepolia runs ENSv2 and that the Universal Resolver and the Sepolia ENS apps resolve through it. It calls the ENSv1 Sepolia contracts "no longer in use". App: https://sepolia.app.ens.domains, Explorer: https://sepolia.explorer.ens.domains.
- The deployment is on L1, not Namechain. ENS Labs dropped Namechain and deploys ENSv2 on Ethereum L1 only (https://ens.domains/blog/post/ens-staying-on-ethereum). ENSv2 went live on mainnet on 2026-10-27 (https://ens.domains/blog/post/ensv2-live-on-mainnet). The deployment is not labelled alpha or preview.
- On-chain reads confirmed it is wired and open:
  - `RootRegistry.getSubregistry("eth")` returns `ETHRegistry`.
  - `ETHRegistry.hasRootRoles(ROLE_REGISTRAR|ROLE_RENEW, ETHRegistrar)` returns `true`, so migration phase 6 ran and v2 registration is open.
  - top URP `implementation()` = `0x6d80…e6F1`, whose `implementation()` = `UniversalResolverV2 0x24e1…`, whose `ROOT_REGISTRY()` = `0xb458…` (the RootRegistry below).

Addresses (from https://docs.ens.domains/learn/deployments, Sepolia ENSv2; each one had bytecode on-chain):

| Contract | Address |
|---|---|
| RootRegistry | `0xb458d6a3a77919449d03e7a6903c26827c1ec43f` |
| ETHRegistry (`.eth` PermissionedRegistry) | `0xd4ebcbbdf463c9c45784603db0ddd499bc44a8b4` |
| ETHRegistrar (commit-reveal) | `0xf633e7fc17e2bbe0d0965d18ec1821dcb754a3d3` |
| StandardRentPriceOracle | `0x8196665d4ca7488b6474a9ec8e7d2719fb42263a` |
| MockUSDC (6 dp, free `mint`) | `0x240b0316df57887dbbe58b586508b19e633a14aa` |
| MockDAI | `0xf6fac8a58a0be13b9197f27c41b73162fe32572b` |
| VerifiableFactory | `0xda70306c98e97ece36f997a21368e53298572991` |
| PermissionedResolverImpl | `0x115eb53f0c60696633855f90b138178fb40b2b2c` |
| UserRegistryImpl (subname registry) | `0x9bd8a88719068d09ecee662f36c0e3856708366a` |
| UniversalResolverV2 (impl) | `0x24e1d8e068620b647ca097f961a61055f4f42d72` |
| UpgradableUniversalResolverProxy (use this) | `0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe` |
| PublicResolverV2 | `0xdc4a563d00f5c3012b699794eb9e13a561be386f` |

There is no separate "resolver factory": a resolver is a `VerifiableFactory` proxy of `PermissionedResolverImpl` (§3). viem 2.57's built-in `sepolia.contracts.ensUniversalResolver` is already `0xeeee…eeee`.

Registrar parameters (on-chain reads):
- `MIN_COMMITMENT_AGE` = 60 s, `MAX_COMMITMENT_AGE` = 86400 s, `MIN_REGISTER_DURATION` = 2419200 s (28 days).
- `getRegisterPrice("skeptique", 365 days, MockUSDC)` = `(8000021, 0)`, about 8.00 USDC with no premium. 28 days costs 613701 (about 0.61 USDC).

## 2. Parent name and subname registries
**Register `skeptique.eth`** through ETHRegistrar (docs https://docs.ens.domains/ensv2/eth-registrar; source `SRC/src/registrar/ETHRegistrar.sol`):
```
makeCommitment(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, bytes32 referrer) pure returns (bytes32)
commit(bytes32 commitment)
register(string label, address owner, bytes32 secret, IRegistry subregistry, address resolver, uint64 duration, IERC20 paymentToken, bytes32 referrer) returns (uint256 tokenId)
isAvailable(string label) view returns (bool)
getRegisterPrice(string label, uint64 duration, IERC20 paymentToken) view returns (uint256 base, uint256 premium)
```
- Payment is ERC-20 via `safeTransferFrom(msg.sender, BENEFICIARY, base+premium)`, so the sender must `approve(ETHRegistrar, base+premium)` first.
- On Sepolia, MockUSDC has an unrestricted `mint(address to, uint256 amount)` (`SRC/test/mocks/MockERC20.sol`). The oracle accepts MockUSDC: the price call returned a value instead of reverting.
- The owner gets a fixed `REGISTRATION_ROLE_BITMAP` = `ROLE_SET_SUBREGISTRY | ROLE_SET_SUBREGISTRY_ADMIN | ROLE_SET_RESOLVER | ROLE_SET_RESOLVER_ADMIN | ROLE_CAN_TRANSFER_ADMIN` (`ETHRegistrar.sol` line 18).

**Subname registries.** Docs: https://docs.ens.domains/ensv2/subnames ("Option 2: subnames as owned tokens") and https://docs.ens.domains/ensv2/verifiable-factory. The devnet helper `createSubname` (`script/testNames/registry.ts` on `main`) uses the same steps. Do this once for `skeptique.eth`, then once each for `svc` and `critic`:
1. Deploy a `UserRegistry` proxy: `VerifiableFactory.deployProxy(UserRegistryImpl, salt, initData)`.
   - `deployProxy(address implementation, uint256 salt, bytes data) returns (address)`. It emits `ProxyDeployed(address sender, address proxyAddress, uint256 salt, address implementation)`.
   - `initData = encodeFunctionData('initialize((address account,uint256 roleBitmap)[] grants)', [[{account: operator, roleBitmap}]])` (`SRC/src/registry/UserRegistry.sol` `initialize(Grant[])`; `Grant{address account; uint256 roleBitmap}` in `SRC/src/access-control/interfaces/IEACGrantInitializable.sol`).
   - Docs salt scheme: `keccak256(abi.encode(keccak256("UserRegistry"), namehash(name), 0))`.
2. Attach it on the parent's registry: `parentRegistry.setSubregistry(uint256 tokenId, IRegistry registry)`. The caller needs `ROLE_SET_SUBREGISTRY` on the token. For `skeptique.eth` the parent registry is `ETHRegistry`, and the tokenId comes from `ETHRegistry.findTokenId("skeptique")`.
3. Set the canonical parent: `newRegistry.setParent(IRegistry parent, string label)` (needs root `ROLE_SET_PARENT`).
4. Create child labels in a registry you hold root `ROLE_REGISTRAR` on: `register(string label, address owner, IRegistry registry, address resolver, uint256 roleBitmap, uint64 expiry) returns (uint256)` (`SRC/src/registry/PermissionedRegistry.sol`). The `roleBitmap` is granted to `owner` on that token only.

Registry roles (`SRC/src/registry/libraries/RegistryRolesLib.sol`; each admin bit = role `<< 128`):

| Role | Value |
|---|---|
| `ROLE_REGISTRAR` | `1<<0` |
| `ROLE_REGISTER_RESERVED` | `1<<4` |
| `ROLE_SET_PARENT` | `1<<8` |
| `ROLE_UNREGISTER` | `1<<12` |
| `ROLE_RENEW` | `1<<16` |
| `ROLE_SET_SUBREGISTRY` | `1<<20` |
| `ROLE_SET_RESOLVER` | `1<<24` |
| `ROLE_CAN_TRANSFER_ADMIN` | `(1<<28)<<128` (admin-only) |
| `ROLE_SET_URI` | `1<<36` |
| `ROLE_UPGRADE` | `1<<124` |

## 3. Deploying a Permissioned Resolver
Docs: https://docs.ens.domains/ensv2/permissioned-resolver and https://docs.ens.domains/ensv2/verifiable-factory#deploying-a-resolver-proxy. Source: `SRC/src/resolver/PermissionedResolver.sol`.
- Call `VerifiableFactory.deployProxy(PermissionedResolverImpl, salt, initData)`. The proxy is a UUPS proxy at a deterministic CREATE2 address, and the factory's outer salt includes `msg.sender`.
- `initData = encodeFunctionData('initialize((address account,uint256 roleBitmap)[] grants, bytes[] calls)', [grants, calls])`.
  - Each grant is applied on `ROOT_RESOURCE` (0).
  - `calls` run as a multicall with `_checkRoles` skipped, so initial records can be set in the same transaction.
- Docs salt: `keccak256(abi.encode(keccak256("OwnedResolver"), owner, version))`. Any `uint256` works. For one resolver per service, use e.g. `keccak256(abi.encode(keccak256("SkeptiqueServiceResolver"), namehash(fullName), 0))`.
- Point a name at it with `registry.setResolver(uint256 anyId, address resolver)` (needs `ROLE_SET_RESOLVER`), or pass `resolver` in `register(...)`.

## 4. Enhanced Access Control
**Resolver roles** (`SRC/src/resolver/libraries/PermissionedResolverLib.sol`; admin = role `<< 128`):

| Role | Value |
|---|---|
| `ROLE_SET_ADDRESS` | `1<<0` |
| `ROLE_SET_TEXT` | `1<<4` |
| `ROLE_SET_CONTENTHASH` | `1<<8` |
| `ROLE_SET_ABI` | `1<<12` |
| `ROLE_SET_INTERFACE` | `1<<16` |
| `ROLE_SET_NAME` | `1<<20` |
| `ROLE_SET_DATA` | `1<<24` |
| `ROLE_LINK` | `1<<28` |
| `ROLE_CAN_NAME` | `1<<120` |
| `ROLE_UPGRADE` | `1<<124` |

**Scope: per-record-type and per-text-key, NOT per-name.**
- `setText(bytes name, string key, string value)` is `onlyRoles(resource(key), ROLE_SET_TEXT)` with `resource(key) = uint256(keccak256(bytes(key)))`. The EAC base combines that resource with `ROOT_RESOURCE`.
- The `name` argument is not part of the permission check.
- Docs say: "A role holder can write covered records on every name the instance serves." The same docs page lists this under "Not per-name".

**Calls**:
- Grant one key: `grantSetterRoles(bytes setter, address account) returns (bool)`.
  - `setter` is any `setText(name, key, value)` calldata; only the selector and key matter.
  - The caller needs `ROLE_SET_TEXT_ADMIN` (on root or on that key's resource).
  - `grantRoles` is disabled and always reverts.
- Revoke one key: `revokeRoles(uint256 resource, uint256 roleBitmap, address account)` with `resource = keccak256(key)`.
- Resolver-wide roles: `grantRootRoles(uint256 roleBitmap, address account)` and `revokeRootRoles(uint256 roleBitmap, address account)`.
- Batching: `multicall(bytes[])` uses `delegatecall`, so `msg.sender` is preserved and several grants fit in one transaction.
- Inspection: `decodeSetter(bytes)` is pure and returns `(arg, resource, roleBitmap)`.
- Limit: at most 15 assignees per role per resource (`EnhancedAccessControl.sol` header).

(a) **Only the relayer writes `skeptique.*` keys:**
- In each resolver, grant the relayer `ROLE_SET_TEXT` on each skeptique key through `grantSetterRoles`.
- Do **not** grant root `ROLE_SET_TEXT` to anyone.
- The operator (the deployer, which owns `skeptique.eth`) is initialised with admin bits only: `ROLE_SET_TEXT_ADMIN` (+ `ROLE_UPGRADE_ADMIN`). With those it can grant but not write: `onlyRoles` checks the base bit, which the operator lacks. It could still grant itself the role; that is the operator trust assumption.

(b) **The seller writes only `url` and `description` on their own subname:** because scope is per key, a seller holding `ROLE_SET_TEXT` on `url` in a *shared* resolver could overwrite every other seller's `url`. So:
- **Deploy one PermissionedResolver per service subname.**
- Grant the seller `ROLE_SET_TEXT` on `url` and `description` in *that* resolver only.
- Set it as that subname's resolver.
- Resolution only consults the resolver set in the registry entry, so anything the seller writes for other names in their own resolver is never read.

Critics have no self-written keys, so all critic subnames can share one resolver where the relayer holds the three critic keys.

**Who owns a seller's subname:** register it in the `svc` registry with `owner = seller` and **`roleBitmap = 0`**. Source (`PermissionedRegistry.sol`):
- `setResolver` and `setSubregistry` require `ROLE_SET_RESOLVER` / `ROLE_SET_SUBREGISTRY` on the token or on root. The seller has neither, so they cannot repoint the resolver.
- Transfers require `ROLE_CAN_TRANSFER_ADMIN` on the sender (`_update`, "ROLE_CAN_TRANSFER_ADMIN is a property of the token (not grantable, ignored on root)"), so the token is non-transferable (soulbound).
- The operator keeps root `ROLE_SET_RESOLVER` on the `svc` registry so it can rotate resolvers. Tokenising does not remove root control (https://docs.ens.domains/ensv2/subnames, "Operator control").
- Alternative: the operator keeps ownership of the token itself. That also works, and the seller then only gets resolver grants.

**Can roles lock resolver and subregistry changes?** Yes:
- A change is impossible once no account holds `ROLE_SET_RESOLVER` / `ROLE_SET_SUBREGISTRY` on the token or on root, and no one holds the matching `_ADMIN` that could re-grant them.
- `PermissionedRegistry.isEmancipated()` returns true when no root holder has any `UNEMANCIPATED_ROLE_BITMAP` role (CAN_TRANSFER_ADMIN, SET_SUBREGISTRY(+ADMIN), SET_RESOLVER(+ADMIN), UNREGISTER(+ADMIN), UPGRADE(+ADMIN)).
- To lock a resolver record type, revoke the role and its admin, plus `ROLE_LINK` and `ROLE_UPGRADE` and their admins (docs, "Lock a record type"; irreversible).
- For the hackathon, do **not** lock: the operator needs to fix mistakes.

## 5. Setting and reading a text record (viem)
```ts
import { encodeFunctionData, decodeFunctionResult, namehash, parseAbi, toHex } from 'viem'
import { packetToBytes } from 'viem/ens'
const dnsName = toHex(packetToBytes('foo.svc.skeptique.eth')) // DNS-encoded bytes, NOT namehash
const resolverAbi = parseAbi([
  'function setText(bytes name, string key, string value)',
  'function grantSetterRoles(bytes setter, address account) returns (bool)',
  'function multicall(bytes[] calls) returns (bytes[])',
])
// write (relayer):
await relayerWallet.writeContract({ address: resolver, abi: resolverAbi, functionName: 'setText',
  args: [dnsName, 'eth.skeptique.score', '87'] })
// read, option 1: viem through the public Universal Resolver (0xeEeE…EeEe is viem's sepolia default)
await publicClient.getEnsText({ name: 'foo.svc.skeptique.eth', key: 'eth.skeptique.score' })
// read, option 2: explicit UR call
const textAbi = parseAbi(['function text(bytes32 node, string key) view returns (string)'])
const [data] = await publicClient.readContract({ address: '0xeEeEEEeE14D718C2B47D9923Deab1335E144EeEe',
  abi: parseAbi(['function resolve(bytes name, bytes data) view returns (bytes, address)']),
  functionName: 'resolve',
  args: [dnsName, encodeFunctionData({ abi: textAbi, functionName: 'text', args: [namehash('foo.svc.skeptique.eth'), 'eth.skeptique.score'] })] })
decodeFunctionResult({ abi: textAbi, functionName: 'text', data })
```
- The resolver has **no standalone `text()` getter**. Reads go through `resolve(bytes name, bytes data)` (`SRC/src/resolver/AbstractRecordResolver.sol`, which dispatches the `text(bytes32,string)` selector and ignores the node argument). Docs: "Reads go through `resolve(name, data)` via the Universal Resolver."
- Setters create a record on first write (record IDs start at 1).
- A name without its own record falls back to the default record at name `0x00`, and fields do not fall back individually (docs warning).

## 6. ENSIP-25, ENSIP-26, ENSIP-5
- **ENSIP-26 Agent Text Records** (https://docs.ens.domains/ensip/26, draft) defines two keys:
  - `agent-context`: free-form agent description.
  - `agent-endpoint[<protocol>]`: URL, with protocols `mcp`, `a2a`, `web`.

  It defines **no reputation keys**, so skeptique's score keys have nothing to map to. Optional fit: a seller could also write `agent-context` / `agent-endpoint[web|mcp]` (granted per key, like `url`). Not required.
- **ENSIP-25 AI Agent Registry ENS Name Verification** (https://docs.ens.domains/ensip/25, draft) defines one key, `agent-registration[<ERC-7930 registry address>][<agentId>]`, with a non-empty value (SHOULD be `"1"`). It attests that a name belongs to an agent in an on-chain agent registry such as ERC-8004. It is only relevant if skeptique links names to an ERC-8004 entry; not needed for v1.
- **ENSIP-5 Text Records** (https://docs.ens.domains/ensip/5, final):
  - `url` and `description` are standard global keys; keep them.
  - "Service Keys must be made up of a _reverse dot notation_ for a namespace which the service owns … must contain at least one dot." The example given is `com.example.users`.
  - Bare `skeptique.score` does contain a dot, but it reads as the namespace `skeptique`, which skeptique does not own. So it is **not conformant**. Nothing on-chain enforces this, and any string works as a key.
  - Conformant form under `skeptique.eth`: **`eth.skeptique.score`**, `eth.skeptique.confidence`, `eth.skeptique.round`, `eth.skeptique.hedera.tx`, `eth.skeptique.stake`, `eth.skeptique.honestRounds`, `eth.skeptique.slashes`.

## Proposed changes to spec/03 (not applied)
1. **Required (structure, not record names): one PermissionedResolver per service subname.** The seller's subname is registered with `roleBitmap = 0` (it cannot change its resolver and cannot be transferred). In that resolver, the relayer holds `ROLE_SET_TEXT` on the four score keys and the seller holds it on `url` and `description`. All critic subnames share one resolver where only the relayer holds the three critic keys.
   - Smallest alternative if the per-service resolver is too much: one shared resolver where the relayer also writes `url`/`description` on the seller's behalf, so sellers hold no resolver roles.
2. **Recommended: prefix keys with `eth.`** (`eth.skeptique.score`, …) for ENSIP-5 conformance. This is a pure string change and must follow `ENS_PARENT_NAME` if the parent differs.
3. Optional: allow seller-written ENSIP-26 `agent-endpoint[web]` / `agent-context`.

## Human steps before phase B (ticket 01)
1. Create two Sepolia EOAs and put their keys in `.env` (never in git): `ENS_OPERATOR_PRIVATE_KEY` (owns the parent, registries and resolver admin) and `SEPOLIA_RELAYER_PRIVATE_KEY` (phase B correction: in this repo `RELAYER_PRIVATE_KEY` is the Hedera relayer). They may be the same key, but separate keys demonstrate EAC better.
2. Fund them with Sepolia ETH: operator about **0.1 SepoliaETH**, relayer about **0.02**. These amounts are estimates (see Unverified).
3. Get a Sepolia RPC URL and set `SEPOLIA_RPC_URL`. The public `https://ethereum-sepolia-rpc.publicnode.com` worked for reads.
4. Set `ENS_PARENT_NAME=skeptique.eth`. Re-check availability just before phase B: `ETHRegistrar(0xf633…).isAvailable("skeptique")`.
5. Registration of the parent name needs no human: the phase B script mints MockUSDC, approves, commits, waits 61 s and registers. If ticket 01 prefers to register by hand at https://sepolia.app.ens.domains, it must register to the operator address, and then the operator holds the token.
6. Optional env overrides (defaults are the addresses in §1): `ENS_ETH_REGISTRY`, `ENS_ETH_REGISTRAR`, `ENS_VERIFIABLE_FACTORY`, `ENS_PERMISSIONED_RESOLVER_IMPL`, `ENS_USER_REGISTRY_IMPL`, `ENS_UNIVERSAL_RESOLVER`, `ENS_MOCK_USDC`.

## Phase B plan (spike script outline)
Constants: registry `ROOT_ROLES = REGISTRAR|SET_PARENT|RENEW|UNREGISTER|SET_SUBREGISTRY|SET_RESOLVER` with each admin bit set (`|` the same set `<< 128`). Resolver admin = `ROLE_SET_TEXT << 128`.
1. **Parent**: if `ETHRegistry.findOwner(label)` is zero:
   - `secret = random`; `c = ETHRegistrar.makeCommitment(label, operator, secret, 0x0, 0x0, 31536000, 0x0)`; `commit(c)`.
   - `MockUSDC.mint(operator, base+premium)`; `MockUSDC.approve(ETHRegistrar, base+premium)`.
   - Wait 61 s, then `register(label, operator, secret, 0x0, 0x0, 31536000, MockUSDC, 0x0)`.
   - `tokenId = ETHRegistry.findTokenId(label)`.
2. **Parent registry**:
   - `deployProxy(UserRegistryImpl, salt("UserRegistry", namehash(parent)), initialize([{operator, ROOT_ROLES}]))`. Read `proxyAddress` from `ProxyDeployed`.
   - `ETHRegistry.setSubregistry(tokenId, parentReg)`.
   - `parentReg.setParent(ETHRegistry, label)`.
3. **`svc` and `critic`**: for each, deploy a UserRegistry (same as step 2, salt with `namehash("svc."+parent)`). Then `parentReg.register("svc", operator, svcReg, 0x0, SET_SUBREGISTRY|SET_RESOLVER (+admins), ETHRegistry.getExpiry(tokenId))` and `svcReg.setParent(parentReg, "svc")`.
4. **Service resolver**:
   - `deployProxy(PermissionedResolverImpl, salt("SkeptiqueServiceResolver", namehash(full)), initialize([{operator, ROLE_SET_TEXT_ADMIN}], []))`.
   - Operator calls `resolver.multicall([grantSetterRoles(setText(dns,k,""), relayer) for each of the 4 skeptique keys, grantSetterRoles(setText(dns,"url",""), seller), grantSetterRoles(setText(dns,"description",""), seller)])`.
5. **Service subname**: `svcReg.register(slug, seller, 0x0, resolver, 0, expiry)`. The seller address comes from a test fixture or `scripts/seed`, never a product path.
6. **Write**: the relayer calls `resolver.setText(dns(full), "eth.skeptique.score", <value>)`.
7. **Read back and print**: `publicClient.getEnsText({ name: full, key: "eth.skeptique.score" })`. This is the "Done when" line.
8. **Negative checks** (simulate only):
   - Seller `setText(dns, "eth.skeptique.score", …)` should revert with `EACUnauthorizedAccountRoles`.
   - Seller `svcReg.setResolver(tokenId, x)` should revert.
   - Seller `safeTransferFrom` should revert. Phase B correction: it reverts with `TransferUnsafeUntilRegistryIsEmancipated` first, because the `svc` registry is not emancipated (the operator holds root roles); `PermissionedRegistry._update` checks that before `ROLE_CAN_TRANSFER_ADMIN` (`SRC/src/registry/PermissionedRegistry.sol` lines 530-539).
   - Seller `unsafeTransfer` should revert with `TransferDisallowed` (same function, line 539).
9. Make every step idempotent (check before writing) so the script can be re-run.

## Unverified
Phase B resolved these:
- **Gas/ETH budget: resolved.** The full setup (parent registration, three registries, one resolver with six grants, one service subname) used 8,590,897 gas from the operator. Sepolia gas was so cheap on 2026-11-06 that this cost about 1.5e-10 ETH. The relayer's one `setText` used 373,372 gas. 0.1 / 0.02 SepoliaETH is far more than enough. Per-call gas is in `spikes/ens-sepolia/transcript.txt`.
- **Child expiry rules: resolved, not enforced.** `PermissionedRegistry._register` only rejects an expiry in the past (`CannotSetPastExpiry`, `SRC/src/registry/PermissionedRegistry.sol` lines 486-488). It does not compare against the parent's expiry. Phase B uses the parent's expiry for `svc`, `critic` and the service subname anyway.
- **Calls during resolver `initialize`: sidestepped.** `initialize` grants roles to the explicit `grants[].account`, so the factory being `msg.sender` doesn't matter for grants (`SRC/src/resolver/PermissionedResolver.sol` lines 119-126). Phase B passes `calls = []` and grants through a separate operator `multicall`, which worked. Whether grants inside `calls` would work is still untested.
- **`getEnsText` against an ENSv2 PermissionedResolver: resolved, works.** viem 2.57.16 `getEnsText` and `getEnsResolver` through `0xeEeE…EeEe` returned the record and the resolver.
- **Factory address prediction: confirmed.** `VerifiableFactory.predictProxyAddress(operator, salt)` matched every `ProxyDeployed.proxyAddress`, so the outer salt does include `msg.sender`. The spike uses it to skip deploys that already exist.

Still open:
- **ENS app with MockUSDC**: whether https://sepolia.app.ens.domains registers with MockUSDC. Not checked.
- **Commit `07e55a05`**: its date and branch relationship to `main` were not established (GitHub API fetch timed out). The live impl's `decodeSetter` behaviour matches it.
- **Proxy stability**: the `0xeEeE` → `0x6d80` proxy chain is upgradable by ENS Labs. `main`'s README records a past temporary repoint, so resolution could change under us. Re-check `implementation()` before the demo.
- Fallback if Sepolia breaks: a local ENSv2 devnet from ENS's repo (`bun run devnet`, chain 31337, `contracts/README.md`). Listed only and not evaluated; the ENSv2 prize requires mainnet or Sepolia (prd.md §4.1).

## Phase B result (2026-11-06)
Script: `spikes/ens-sepolia/ens.mjs` (`cd spikes/ens-sepolia && npm install && node ens.mjs [slug] [score]`). Transcript with every tx hash: `spikes/ens-sepolia/transcript.txt`. The plan above worked as written, apart from the corrections marked "Phase B correction".

| Item | Value |
|---|---|
| `skeptique.eth` owner | operator `0x6f1842bC9d1198eC49d21B60C336296f9fc8DCA2`, expiry 2027-11-06 |
| `skeptique.eth` registry | `0x2790d7A94541fC80eAC82a2653EB4cdD9a4097Fb` |
| `svc.skeptique.eth` registry | `0x9A7a52082010ac8bd51d502afE7E1974916c06dF` |
| `critic.skeptique.eth` registry | `0x70571E87e6dDD98e44E4d9F8AB7eDD50b5234dCb` |
| `spike.svc.skeptique.eth` resolver | `0xD11036E3Dc1281912aaA44F088Fe61d3Bb68ad1a` (owner: seller, `roleBitmap 0`) |
| Read back | `text("eth.skeptique.score") = "87"` through the Universal Resolver |

Negative checks (simulated with `eth_call`, all as expected):
- The seller can't write `eth.skeptique.score` (`EACUnauthorizedAccountRoles`), but can write `url`.
- The relayer can't write `url`.
- The seller can't `setResolver` on their own subname.
- The seller can't transfer it: `safeTransferFrom` reverts with `TransferUnsafeUntilRegistryIsEmancipated` and `unsafeTransfer` reverts with `TransferDisallowed`.

Gotcha for ticket code: a load-balanced public RPC (`publicnode`) can answer a read from a node that hasn't seen your last transaction yet. Run 1 read the new parent's expiry as `0` straight after `register`, and the next `register` then reverted with `CannotSetPastExpiry(0)`. Pin follow-up reads to the receipt's `blockNumber`, or wait until `getBlockNumber()` reaches it.
