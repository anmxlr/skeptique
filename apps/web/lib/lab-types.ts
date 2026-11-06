import type { Evidence } from "@skeptique/shared";

export type LabService = {
  id: string;
  name: string;
  description: string;
  category: string;
  publicCases: number;
  probes: number;
};
export type LabCase = {
  id: string;
  phase: "public" | "probe";
  input: unknown;
  expected: unknown;
  output?: unknown;
  passed: boolean;
  latencyMs: number;
  error?: string;
};
export type LabResult = {
  id: string;
  name: string;
  error?: string;
  publicPass?: number;
  probePass?: number;
  score?: number;
  evidence?: Evidence;
  evidenceHash?: string;
  cases?: LabCase[];
  recommendation?: string;
};
export type LabRun = {
  id: string;
  mode: "local-fixture";
  startedAt: string;
  durationMs: number;
  scenario: "baseline" | "slow" | "outage";
  budget: number;
  calls: number;
  results: LabResult[];
};
