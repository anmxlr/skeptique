# Testnet end to end: evidence

Run started 2026-11-07T02:08:02.555Z, finished 2026-11-07T02:23:55.325Z. Produced by `scripts/demo/testnet-e2e.ts` (`pnpm test:live -t "testnet end to end"`) against Hedera testnet, Sepolia ENS and World staging. Nothing below is mocked.

## Acceptance

| Criterion | Met |
|---|---|
| Settled x402 payment tx id | yes |
| Finalise tx | yes |
| ENS record read through the resolver | yes |
| HCS message | yes |
| Unattended buyer payment | yes |

## Steps

### 0. Preflight: ports free, in-process x402-paywalled services started

Status: **ok**

- unit-convert serving http://127.0.0.1:4101/call, price 1 tinybar, payTo 0.0.11334361
- suite-gamer serving http://127.0.0.1:4102/call, price 1 tinybar, payTo 0.0.11334361

### 0b. Start the API (apps/api, port 4000)

Status: **ok**

- API answering GET /services

### 3a. Start the keeper and 3 critic daemons

Status: **ok**

- critic 1: 0x8aF1499c93b3dD67676898CccF28330F6743d442 (hedera account 0.0.11334613)
- critic 2: 0x27Dc08950b37a5C7E40d52499B0e2c8eBB90FCE0 (hedera account 0.0.11334616)
- critic 3: 0xB47cbFc3cE539DbdcDcEBE635c4e0B0421Bb22d9 (hedera account 0.0.11334620)
- keeper running as 0xd1eE8F4C8FAbeB7C2DB9c0fC2053e7cb16fC1Cfb

### 1a. List unit-convert and suite-gamer on the Hedera testnet ServiceRegistry (reuse if already listed)

Status: **ok**

- unit-convert: already listed as service 2
- suite-gamer: already listed as service 3

### 1b. Sepolia ENS: set up namespace and create service subnames

Status: **ok**

- namespace ready under skeptique.eth
- pass created=[] failed=[] (already-existing subnames are skipped)

### 2. World ID 4.0 staging proof via the official simulator, validated by our API

Status: **ok**

- /world/verify -> 200, voucher issued for 0x8aF1499c93b3dD67676898CccF28330F6743d442, nullifier 0x1e1c0c2bcdf61aa3c3cb7c1306f0fdebef3971b2cec64bd2c7b11d4482490554

### 3b. Rounds: critics pay via x402, commit, reveal; keeper finalises (non-void) for both services

Status: **ok**

- round 25 service 3: median 0, reveals 0, void=true, tx 0x4057beb7ab3208812fc1d62a39b0c331af9652885d4e5925d5e3ac336e55e5ab
- round 26 service 2: median 100, reveals 3, void=false, tx 0x4068a66d5f87c7e7447f49de9cda17298213e2b024857c2af2fa9c91283fb626
- round 27 service 1: median 0, reveals 0, void=true, tx 0x1aa4161664fd89e1100fd0db901620a6237d061cfeaa592aa46fbf3b7a21a789
- round 28 service 3: median 40, reveals 3, void=false, tx 0xd9ea6c043208ab733662bdb2a18b3b172a30a5771eff931e128d4a08400072d9

### 4. Write finalised scores to Sepolia ENS and read them back through the resolver

Status: **ok**

- unit-convert.svc.skeptique.eth: wrote written; resolver 0xe0F2150D5C8E3B2bA76D85a6F98dB72fB8BdE2B4 returns score 100 round 26
- suite-gamer.svc.skeptique.eth: wrote written; resolver 0xC54288851d881Bd6F86d89f84299310690d99e58 returns score 40 round 28

### 5. HCS audit log: relay finalised rounds to the topic, read back from the mirror node

Status: **failed**, error: `transaction 0.0.11334611@1794018146.445503417 failed precheck with status DUPLICATE_TRANSACTION against node account id 0.0.3`


### 6. Buyer: one unattended payment, one approved over-threshold payment, agent_spend to HCS

Status: **ok**

- unattended: picked unit-convert, paid=true, tx 0.0.9185802@1794018210.673093473
- over-threshold-approved: picked unit-convert, paid=true, tx 0.0.9185802@1794018221.338528590

### 5b. HCS read-back of the topic through the mirror node

Status: **ok**

- 25 message(s) readable

## Services on Hedera testnet

| Service | Service id | Endpoint | Listing |
|---|---|---|---|
| unit-convert | 2 | `http://127.0.0.1:4101/call` | reused |
| suite-gamer | 3 | `http://127.0.0.1:4102/call` | reused |

## ENS subnames (Sepolia)

| Name | Exists |
|---|---|
| `unit-convert.svc.skeptique.eth` | yes |
| `suite-gamer.svc.skeptique.eth` | yes |

## World

Verify status 200, nullifier `0x1e1c0c2bcdf61aa3c3cb7c1306f0fdebef3971b2cec64bd2c7b11d4482490554`. Proof is real (World staging simulator, validated at developer.world.org). The three persona critics that ran the rounds were registered by ticket 21 with synthetic nullifiers, not with this proof.

## Settled x402 payments

| Service | Tx id | HashScan | Payer |
|---|---|---|---|
| suite-gamer | `0.0.9185802@1794017293.611991363` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017293.611991363) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017289.742153926` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017289.742153926) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017291.760169475` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017291.760169475) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017291.346890544` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017291.346890544) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017297.667493581` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017297.667493581) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017293.433351616` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017293.433351616) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017294.759498346` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017294.759498346) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017296.547034314` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017296.547034314) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017299.286795107` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017299.286795107) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017297.315402309` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017297.315402309) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017301.319559318` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017301.319559318) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017300.912684622` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017300.912684622) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017301.098765360` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017301.098765360) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017300.372371847` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017300.372371847) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017304.939882812` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017304.939882812) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017301.367856665` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017301.367856665) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017306.825939411` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017306.825939411) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017306.383485983` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017306.383485983) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017305.362883765` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017305.362883765) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017306.784666952` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017306.784666952) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017307.999611597` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017307.999611597) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017306.566408987` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017306.566408987) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017308.338620178` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017308.338620178) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017307.043741429` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017307.043741429) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017316.468049324` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017316.468049324) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017315.429471322` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017315.429471322) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017318.667816094` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017318.667816094) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017317.816996620` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017317.816996620) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017396.844632945` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017396.844632945) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017401.050609226` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017401.050609226) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017402.516694752` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017402.516694752) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017401.625656303` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017401.625656303) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017400.075328809` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017400.075328809) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017400.651774777` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017400.651774777) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017405.224822804` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017405.224822804) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017403.490490709` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017403.490490709) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017404.588430583` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017404.588430583) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017402.745268220` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017402.745268220) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017404.257741543` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017404.257741543) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017406.432752680` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017406.432752680) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017406.012747875` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017406.012747875) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017408.515993882` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017408.515993882) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017408.325356281` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017408.325356281) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017408.009332710` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017408.009332710) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017407.168889084` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017407.168889084) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017408.100222447` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017408.100222447) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017411.835116342` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017411.835116342) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017411.479905218` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017411.479905218) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017412.627827415` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017412.627827415) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017409.429295620` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017409.429295620) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017411.164891788` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017411.164891788) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017415.152252526` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.152252526) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017415.588601398` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.588601398) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017415.837181209` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.837181209) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017415.300187929` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.300187929) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017415.334971629` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.334971629) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017415.312364824` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.312364824) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017415.967518835` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017415.967518835) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017420.013746766` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017420.013746766) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017417.203003501` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017417.203003501) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017419.929647864` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017419.929647864) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017419.046201382` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017419.046201382) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017423.046011637` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017423.046011637) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017426.505477300` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017426.505477300) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017426.173877315` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017426.173877315) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017425.725121805` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017425.725121805) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017427.741542845` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017427.741542845) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017427.034003007` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017427.034003007) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017432.231792488` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017432.231792488) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017747.317368195` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017747.317368195) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017747.244332345` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017747.244332345) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017746.272956983` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017746.272956983) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017747.002579389` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017747.002579389) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017750.036822689` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017750.036822689) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017749.868372181` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017749.868372181) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017751.397543910` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017751.397543910) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017752.496764482` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017752.496764482) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017751.087946868` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017751.087946868) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017753.240266454` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017753.240266454) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017755.658151828` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017755.658151828) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017755.908464335` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017755.908464335) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017754.374358147` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017754.374358147) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017754.529509887` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017754.529509887) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017754.085149954` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017754.085149954) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017755.008735701` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017755.008735701) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017759.990192149` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017759.990192149) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017760.349177403` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017760.349177403) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017757.009177736` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017757.009177736) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017758.901865488` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017758.901865488) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017759.906091661` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017759.906091661) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017758.411511375` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017758.411511375) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017761.470960305` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017761.470960305) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017761.781975177` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017761.781975177) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017762.592293710` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017762.592293710) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017763.161210440` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017763.161210440) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017765.194255462` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017765.194255462) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017765.030939893` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017765.030939893) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017766.138913701` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017766.138913701) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017763.745581473` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017763.745581473) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017764.649363136` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017764.649363136) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017768.770990475` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017768.770990475) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017765.838764314` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017765.838764314) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017769.352249818` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017769.352249818) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017769.903262159` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017769.903262159) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017771.025606039` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017771.025606039) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017773.209477154` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017773.209477154) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017774.534108017` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017774.534108017) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017774.591457399` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017774.591457399) | 0.0.11334620 |
| suite-gamer | `0.0.9185802@1794017777.470201635` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017777.470201635) | 0.0.11334616 |
| suite-gamer | `0.0.9185802@1794017776.905093655` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017776.905093655) | 0.0.11334613 |
| suite-gamer | `0.0.9185802@1794017778.104383595` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017778.104383595) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017919.945374008` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017919.945374008) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017918.832115221` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017918.832115221) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017918.393306009` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017918.393306009) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017921.675294927` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017921.675294927) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017925.548727223` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017925.548727223) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017920.781191019` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017920.781191019) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017923.559683633` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017923.559683633) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017925.068443125` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017925.068443125) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017928.849725454` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017928.849725454) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017928.701776720` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017928.701776720) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017926.600537767` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017926.600537767) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017928.994622736` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017928.994622736) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017928.451403149` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017928.451403149) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017931.958229595` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017931.958229595) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017933.924690427` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017933.924690427) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017931.471584872` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017931.471584872) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017933.307911014` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017933.307911014) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017933.501756313` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017933.501756313) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017934.870070011` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017934.870070011) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017937.317680577` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017937.317680577) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017936.440573676` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017936.440573676) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017937.017816784` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017937.017816784) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017937.135056088` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017937.135056088) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017936.470458345` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017936.470458345) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017939.060203402` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017939.060203402) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017936.853398974` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017936.853398974) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017939.695280978` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017939.695280978) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017939.595612314` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017939.595612314) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017939.288263408` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017939.288263408) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017941.185702364` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017941.185702364) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017944.302625698` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017944.302625698) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017944.344869186` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017944.344869186) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017944.704229672` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017944.704229672) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017946.325370306` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017946.325370306) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017946.632451184` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017946.632451184) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017947.461666301` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017947.461666301) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017951.955419225` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017951.955419225) | 0.0.11334613 |
| unit-convert | `0.0.9185802@1794017948.361616769` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017948.361616769) | 0.0.11334620 |
| unit-convert | `0.0.9185802@1794017949.976479310` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017949.976479310) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017953.438200248` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017953.438200248) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017959.827888205` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017959.827888205) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794017962.055974733` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794017962.055974733) | 0.0.11334616 |
| unit-convert | `0.0.9185802@1794018210.673093473` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794018210.673093473) | 0.0.11334607 |
| unit-convert | `0.0.9185802@1794018221.338528590` | [view](https://hashscan.io/testnet/transaction/0.0.9185802@1794018221.338528590) | 0.0.11334607 |

## Finalised rounds

| Service | Round | Median | Reveals | Finalise tx |
|---|---|---|---|---|
| unit-convert (#2) | 26 | 100 | 3 | [0x4068a66d5f87…](https://hashscan.io/testnet/transaction/0x4068a66d5f87c7e7447f49de9cda17298213e2b024857c2af2fa9c91283fb626) |
| suite-gamer (#3) | 28 | 40 | 3 | [0xd9ea6c043208…](https://hashscan.io/testnet/transaction/0xd9ea6c043208ab733662bdb2a18b3b172a30a5771eff931e128d4a08400072d9) |

## ENS writes and resolver reads

| Name | Write | Resolver | Score | Confidence | Round | Hedera tx in record | Block |
|---|---|---|---|---|---|---|---|
| `unit-convert.svc.skeptique.eth` | [written](https://sepolia.etherscan.io/tx/0x566928b4cd83c8151e6e4129204041378b91fc6a85de58a60806375b49294c9b) | 0xe0F2150D5C8E3B2bA76D85a6F98dB72fB8BdE2B4 | 100 | 0.6 | 26 | `0x4068a66d5f87…` | 12080654 |
| `suite-gamer.svc.skeptique.eth` | [written](https://sepolia.etherscan.io/tx/0xc5822361fec0fb485da642d2e2a5e370f9a31c916f4c56a7a4f6b0f6adceceee) | 0xC54288851d881Bd6F86d89f84299310690d99e58 | 40 | 0.6 | 28 | `0xd9ea6c043208…` | 12080656 |

## HCS audit log, topic [0.0.11335650](https://hashscan.io/testnet/topic/0.0.11335650)

Posted this run: 0. Latest messages read back from the mirror node:

| Seq | Type | Message | Mirror row |
|---|---|---|---|
| 30 | agent_spend | `{"type":"agent_spend","payer":"0.0.11334607","merchant":"0.0.11334361","amount":"1","txId":"0.0.9185802@1794018221.338528590","ts":1794018230407}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/30) |
| 29 | agent_spend | `{"type":"agent_spend","payer":"0.0.11334607","merchant":"0.0.11334361","amount":"1","txId":"0.0.9185802@1794018210.673093473","ts":1794018217600}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/29) |
| 28 | round_finalized | `{"type":"round_finalized","roundId":"25","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/28) |
| 27 | round_finalized | `{"type":"round_finalized","roundId":"24","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/27) |
| 26 | round_finalized | `{"type":"round_finalized","roundId":"23","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/26) |
| 25 | round_finalized | `{"type":"round_finalized","roundId":"21","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/25) |
| 24 | round_finalized | `{"type":"round_finalized","roundId":"20","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/24) |
| 23 | round_finalized | `{"type":"round_finalized","roundId":"19","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794018073}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/23) |
| 22 | round_finalized | `{"type":"round_finalized","roundId":"18","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/22) |
| 21 | round_finalized | `{"type":"round_finalized","roundId":"17","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/21) |
| 20 | round_finalized | `{"type":"round_finalized","roundId":"16","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/20) |
| 19 | round_finalized | `{"type":"round_finalized","roundId":"15","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/19) |
| 18 | round_finalized | `{"type":"round_finalized","roundId":"14","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/18) |
| 17 | round_finalized | `{"type":"round_finalized","roundId":"13","serviceId":"3","median":0,"nReveals":2,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/17) |
| 16 | round_finalized | `{"type":"round_finalized","roundId":"12","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/16) |
| 15 | round_finalized | `{"type":"round_finalized","roundId":"11","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/15) |
| 14 | round_finalized | `{"type":"round_finalized","roundId":"10","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/14) |
| 13 | round_finalized | `{"type":"round_finalized","roundId":"9","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/13) |
| 12 | round_finalized | `{"type":"round_finalized","roundId":"8","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/12) |
| 11 | round_finalized | `{"type":"round_finalized","roundId":"7","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/11) |
| 10 | round_finalized | `{"type":"round_finalized","roundId":"6","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/10) |
| 9 | round_finalized | `{"type":"round_finalized","roundId":"5","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017973}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/9) |
| 8 | round_finalized | `{"type":"round_finalized","roundId":"4","serviceId":"3","median":0,"nReveals":0,"isVoid":true,"ts":1794017960}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/8) |
| 7 | round_finalized | `{"type":"round_finalized","roundId":"3","serviceId":"1","median":0,"nReveals":0,"isVoid":true,"ts":1794017960}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/7) |
| 6 | round_finalized | `{"type":"round_finalized","roundId":"2","serviceId":"2","median":0,"nReveals":0,"isVoid":true,"ts":1794017960}` | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/6) |

## Buyer

| Kind | Picked | Payment tx | Approval |
|---|---|---|---|
| unattended | unit-convert | [0.0.9185802@1794018210.673093473](https://hashscan.io/testnet/transaction/0.0.9185802@1794018210.673093473) | n/a |
| over-threshold-approved | unit-convert | [0.0.9185802@1794018221.338528590](https://hashscan.io/testnet/transaction/0.0.9185802@1794018221.338528590) | 01364603-5533-4e8a-83ea-8b44c21eae0e |

- unattended: Picked unit-convert: rank 94.0, from a median score 100/100 over 1 round with confidence 60%. Next best: suite-gamer at rank 34.0 (median 40/100).

- over-threshold-approved: Picked unit-convert: rank 94.0, from a median score 100/100 over 1 round with confidence 60%. Next best: suite-gamer at rank 34.0 (median 40/100).

`agent_spend` messages on HCS:

| Seq | Tx id | Merchant | Amount (tinybars) | Mirror row |
|---|---|---|---|---|
| 30 | `0.0.9185802@1794018221.338528590` | 0.0.11334361 | 1 | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/30) |
| 29 | `0.0.9185802@1794018210.673093473` | 0.0.11334361 | 1 | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/29) |

## Known gaps (honest)

- Ticket 20's live ENS test was skipped when it was merged; this run is the first live exercise of service-subname creation and score writes together.
- Ticket 23's HCS poster is not wired into the relayer `cli.ts`; this run calls `relayAuditFromChain` directly.
- Ticket 26's `agent_spend` posting was only mocked-tested before this run.
- The three persona critics were registered by ticket 21 with synthetic nullifiers, so their registrations are not backed by a live World proof.
- Services are served from localhost ports by this script, with endpoints `http://127.0.0.1:4101/call` and `:4102/call` recorded on-chain; they are not publicly reachable.
- ENS scores are written with `createScoreRelayer.finalize` directly: the services were listed with a zero ENS node on-chain, so `relayScoresFromChain` would skip them for a namehash mismatch.
- Rounds opened for the old fixture service 1 end void (its endpoint is dead) and are ignored here.

## Supplement: HCS catch-up after step 5 failed

Step 5 above failed part-way with `DUPLICATE_TRANSACTION` (a Hedera transaction-id collision while posting a burst of messages), so the finalise messages for rounds 26 and 28 were not posted by the main run. `scripts/demo/hcs-catchup.ts` re-ran the same `relayAuditFromChain` call once afterwards (idempotent: the topic is the checkpoint). It posted 8 messages, including the two real finalisations:

| Seq | Message | Mirror row |
|---|---|---|
| 32 | `round_finalized` round 26, service 2, median 100, 3 reveals | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/32) |
| 34 | `round_finalized` round 28, service 3, median 40, 3 reveals | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/34) |
| 36-38 | `critic_slashed` for round 29, reason `no-reveal`, 0.5 HBAR each | [row](https://testnet.mirrornode.hedera.com/api/v1/topics/0.0.11335650/messages/36) |

Round 29 (service 2) was opened by the keeper just as the run ended and the critic daemons were stopped, so all three critics were slashed for not revealing. That is a side effect of stopping this script, not a finding about the critics.

## Run settings

The live run used `LLM_MODEL=gpt-4o-mini`, `LLM_TIMEOUT_MS=60000`, `LLM_MAX_PROBES=2`, `CRITIC_OP_TIMEOUT_MS=40000`, `CRITIC_POLL_MS=1000`, `CRITIC_COMMIT_MARGIN_SECS=6`, `CRITIC_ROUND_BUDGET_MS=90000`. Earlier attempts left void rounds on-chain (rounds 7 to 25): the configured LLM rejected `temperature: 0`, its default 15 s timeout was shorter than a probe-generation call, and a full review did not fit the 90 s commit window with the default 20 probes.
