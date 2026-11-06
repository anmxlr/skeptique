import { describe, expect, it } from "vitest";
import { DEFAULT_DEPLOYMENT_PATH, resolveDeploymentPath } from "./deployment-file";

describe("shared deployment path", () => {
  it("uses the same default for empty copied env values and whitespace", () => {
    expect(resolveDeploymentPath("")).toBe(DEFAULT_DEPLOYMENT_PATH);
    expect(resolveDeploymentPath("  ")).toBe(DEFAULT_DEPLOYMENT_PATH);
    expect(resolveDeploymentPath("contracts/deployments/hedera-testnet.json")).toBe(DEFAULT_DEPLOYMENT_PATH);
    expect(resolveDeploymentPath("/private/tmp/explicit-deployment.json")).toBe("/private/tmp/explicit-deployment.json");
  });
});
