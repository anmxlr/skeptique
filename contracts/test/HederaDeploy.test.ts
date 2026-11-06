import { strict as assert } from "node:assert";
import { describe, it } from "mocha";
import { deploymentConfig, privateKey } from "../deploy/hedera";

describe("Hedera deployment configuration", () => {
  it("keeps constructor money in tinybars and uses the specified short demo windows", () => {
    const config = deploymentConfig(true);
    assert.equal(config.minStakeTinybars, "500000000");
    assert.equal(config.minListingFeeTinybars, "2000000000");
    assert.equal(config.commitSeconds, 90);
    assert.equal(config.revealSeconds, 45);
    assert.equal(deploymentConfig().commitSeconds, 600);
  });

  it("rejects invalid key scalars without including their values in the error", () => {
    for (const value of ["00".repeat(32), "ff".repeat(32), "invalid-secret-value"]) {
      assert.throws(() => privateKey({ KEY: value }, "KEY"), error =>
        error instanceof Error && error.message.includes("KEY must contain") && !error.message.includes(value));
    }
    assert.equal(privateKey({ KEY: "01".repeat(32) }, "KEY"), `0x${"01".repeat(32)}`);
  });
});
