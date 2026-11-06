import { describe, expect, it } from "vitest";
import { ensKeyPrefix, SELLER_KEYS, scoreKeys, serviceEnsName, serviceSlug } from "./ens";

describe("ens naming", () => {
  it("slugs a service name into one DNS-safe label", () => {
    expect(serviceSlug("Unit Convert")).toBe("unit-convert");
    expect(serviceSlug("  csv_clean!! ")).toBe("csv-clean");
  });

  it("puts the service under svc of the parent", () => {
    expect(serviceEnsName("unit-convert", "skeptique.eth")).toBe("unit-convert.svc.skeptique.eth");
  });

  it("derives ENSIP-5 keys from the parent name, not a constant", () => {
    expect(ensKeyPrefix("skeptique.eth")).toBe("eth.skeptique");
    expect(scoreKeys("skeptique.eth")).toEqual([
      "eth.skeptique.score",
      "eth.skeptique.confidence",
      "eth.skeptique.round",
      "eth.skeptique.hedera.tx",
    ]);
    expect(scoreKeys("demo.eth")[0]).toBe("eth.demo.score");
    expect(SELLER_KEYS).toEqual(["url", "description"]);
  });
});
