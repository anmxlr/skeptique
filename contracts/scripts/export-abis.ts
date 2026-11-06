import { exportMechanismAbis } from "../deploy/hedera";

exportMechanismAbis().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
