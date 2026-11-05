# Spec changelog

## 2026-11-06: score weights and demo length (human OK in planning session)
- `02-mechanism.md` §4: score weights changed from `0.7 * suitePass + 0.3 * probePass` to `0.4 * suitePass + 0.6 * probePass`. Reason: under 0.7/0.3 a suite-gaming service at 100/20 still scores ~76 against ~90 for a good service, so probes could not visibly expose it. Under 0.4/0.6 it is ~52 vs ~86.
- `05-demo-script.md`: target length 4:00 (was 4:30). Reason: ETHGlobal asks for 2-4 minute videos and finalists demo in 4 minutes; Hedera's 5:00 cap still holds.
