import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDemoSeed, seedDemoState } from "./seed";

let directory = "";
afterEach(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
  directory = "";
});

describe("demo seed", () => {
  it("includes five services, critic personas, history, and gamer-favoring popularity", () => {
    const seed = buildDemoSeed();
    expect(seed.services).toHaveLength(5);
    expect(seed.critics.map((critic) => critic.persona)).toEqual([
      "balanced",
      "balanced",
      "balanced",
      "lazy-copier",
      "bribed",
    ]);
    expect(seed.services.find((service) => service.name === "suite-gamer")!.popularityCalls).toBeGreaterThan(
      Math.max(
        ...seed.services.filter((service) => service.name !== "suite-gamer").map((service) => service.popularityCalls),
      ),
    );
    expect(seed.scoreHistory).toHaveLength(5);
    expect(new Set(seed.scoreHistory.map((round) => round.roundId)).size).toBe(seed.scoreHistory.length);
    expect(seed.openRound.roundId).toBeGreaterThan(Math.max(...seed.scoreHistory.map((round) => round.roundId)));
  });

  it("allows concurrent deterministic seeds without colliding temporary files", async () => {
    directory = await mkdtemp(join(tmpdir(), "skeptic-seed-concurrent-"));
    const path = join(directory, "demo-state.json");
    const states = await Promise.all(Array.from({ length: 8 }, () => seedDemoState(path)));
    expect(states.every((state) => JSON.stringify(state) === JSON.stringify(states[0]))).toBe(true);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(states[0]);
  });

  it("writes byte-identical state when seeded twice", async () => {
    directory = await mkdtemp(join(tmpdir(), "skeptic-seed-test-"));
    const path = join(directory, "demo-state.json");
    const first = await seedDemoState(path);
    const firstContents = await readFile(path, "utf8");
    const second = await seedDemoState(path);
    const secondContents = await readFile(path, "utf8");
    expect(second).toEqual(first);
    expect(secondContents).toBe(firstContents);
  });
});
