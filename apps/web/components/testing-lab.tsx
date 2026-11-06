"use client";

import { useCallback, useEffect, useState } from "react";
import type { LabResult, LabRun, LabService } from "../lib/lab-types";
import styles from "./testing-lab.module.css";

const roadmap = [
  {
    name: "Service evaluation",
    status: "Available locally",
    detail: "Existing critic evaluator, HTTP services, public checks and recorded private-probe fixtures.",
  },
  {
    name: "Evidence and scoring",
    status: "Available locally",
    detail: "Inspectable outputs, SHA-256 evidence digests and the existing 40% public / 60% probe score.",
  },
  {
    name: "Staked review rounds",
    status: "Implemented; separate flow",
    detail: "Local contract tests cover commit/reveal and finalization. This lab does not execute those contracts.",
  },
  {
    name: "Hedera payments",
    status: "Individual live evidence",
    detail:
      "A testnet x402 payment is recorded. This lab makes free local HTTP requests; the full buyer payment flow still needs wiring.",
  },
  {
    name: "ENS and World",
    status: "Individual live evidence",
    detail:
      "ENS permissions and World onboarding have recorded checks. A complete integrated live rehearsal remains pending.",
  },
  {
    name: "Critic incentives",
    status: "Still to build",
    detail: "Rewards, claims, non-reveal handling and failed-round recovery must be completed.",
  },
  {
    name: "Company evaluations",
    status: "Early experiment",
    detail:
      "This workbench is the first private evaluation experience. Customer uploads, accounts and billing are not built.",
  },
  {
    name: "RL training",
    status: "Future exploration",
    detail:
      "No training loop or model updates here. Independent evaluation cases must stay separate from future training tasks.",
  },
];

async function labRequest<T>(resource: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/lab/${resource}`, { ...init, cache: "no-store" });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error ?? "The request failed. Try again.");
  return body;
}

function percent(value?: number) {
  return value === undefined ? "—" : `${Math.round(value)}%`;
}
function json(value: unknown) {
  return value === undefined ? "No output" : JSON.stringify(value, null, 2);
}

export function TestingLab() {
  const [services, setServices] = useState<LabService[]>([]);
  const [selected, setSelected] = useState(["unit-convert", "suite-gamer"]);
  const [scenario, setScenario] = useState<LabRun["scenario"]>("baseline");
  const [budget, setBudget] = useState(100);
  const [history, setHistory] = useState<LabRun[]>([]);
  const [run, setRun] = useState<LabRun | null>(null);
  const [activeService, setActiveService] = useState("unit-convert");
  const [tab, setTab] = useState("evaluation");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [failedOnly, setFailedOnly] = useState(false);
  const [caseId, setCaseId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError("");
    try {
      const [catalog, previous] = await Promise.all([
        labRequest<LabService[]>("services", { signal }),
        labRequest<LabRun[]>("runs", { signal }),
      ]);
      setServices(catalog);
      setHistory(previous);
      if (previous.length) {
        setRun(previous[0]);
        setActiveService(previous[0].results[0].id);
      }
    } catch (e) {
      if (!signal?.aborted) setError(e instanceof Error ? e.message : "Could not connect to the lab.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  async function evaluate() {
    setBusy(true);
    setError("");
    setCaseId(null);
    setFailedOnly(false);
    try {
      const next = await labRequest<LabRun>("runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ services: selected, scenario, budget }),
        signal: AbortSignal.timeout(95_000),
      });
      setRun(next);
      setHistory((old) => [next, ...old].slice(0, 20));
      setActiveService(next.results[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Evaluation failed. Retry the run.");
    } finally {
      setBusy(false);
    }
  }

  function download() {
    if (!run) return;
    const blob = new Blob([JSON.stringify(run, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `skeptique-${run.id}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const result: LabResult | undefined = run?.results.find((r) => r.id === activeService);
  const cases = result?.cases ?? [];
  const visibleCases = cases.filter((c) => !failedOnly || !c.passed);
  const inspected = cases.find((c) => `${c.phase}-${c.id}` === caseId);
  const checks = run?.results.flatMap((r) => r.cases ?? []) ?? [];
  const validBudget = Number.isInteger(budget) && budget >= 1 && budget <= 200;

  return (
    <div className={styles.lab}>
      <div className={styles.intro}>
        <div>
          <div className={styles.titleRow}>
            <span className={styles.mark} aria-hidden="true">
              s.
            </span>
            <h1>Testing lab</h1>
            <span className={styles.alpha}>Early preview</span>
          </div>
          <p className={styles.lead}>Put agentic services to the test.</p>
          <p>Run the checks. Find the failures. See what deserves your trust.</p>
        </div>
        <span className={styles.local}>
          <span />
          Local evaluation
        </span>
      </div>
      <div className={styles.disclosure}>
        Real service code. Real HTTP checks. Published local fixtures. No funds move and no blockchain attestations are
        created.
      </div>
      <div className={styles.tabs} role="tablist" aria-label="Lab views">
        <button
          type="button"
          role="tab"
          id="evaluation-tab"
          aria-controls="evaluation-panel"
          aria-selected={tab === "evaluation"}
          onClick={() => setTab("evaluation")}
        >
          Evaluation workbench
        </button>
        <button
          type="button"
          role="tab"
          id="map-tab"
          aria-controls="map-panel"
          aria-selected={tab === "map"}
          onClick={() => setTab("map")}
        >
          What we have built
        </button>
      </div>
      {tab === "map" ? (
        <section role="tabpanel" id="map-panel" aria-labelledby="map-tab" className={styles.project}>
          <h2>From testing to trust</h2>
          <p>Current capabilities and the work ahead. Sponsor evidence is separate from the results in this lab.</p>
          <div className={styles.roadmap}>
            {roadmap.map((item) => (
              <article key={item.name}>
                <span className={styles.stage}>{item.status}</span>
                <h3>{item.name}</h3>
                <p>{item.detail}</p>
              </article>
            ))}
          </div>
          <a href="/limits">Read the project’s trust limits</a>
        </section>
      ) : (
        <div role="tabpanel" id="evaluation-panel" aria-labelledby="evaluation-tab" className={styles.workbench}>
          <aside className={styles.settings}>
            <h2>Configure a run</h2>
            <p>Start with two services that make the same promise.</p>
            <fieldset disabled={busy || loading}>
              <legend>Services to evaluate</legend>
              {loading ? (
                <p role="status">Connecting to the test runner…</p>
              ) : (
                services.map((service) => (
                  <label key={service.id} className={styles.serviceChoice}>
                    <input
                      type="checkbox"
                      checked={selected.includes(service.id)}
                      onChange={(e) =>
                        setSelected((old) =>
                          e.target.checked ? [...old, service.id] : old.filter((id) => id !== service.id),
                        )
                      }
                    />
                    <span>
                      <strong>{service.name}</strong>
                      <small>
                        {service.category} · {service.publicCases} public + {service.probes} probes
                      </small>
                      <span className={styles.serviceDescription}>{service.description}</span>
                    </span>
                  </label>
                ))
              )}
            </fieldset>
            <label className={styles.field}>
              Environment
              <select
                value={scenario}
                disabled={busy}
                onChange={(e) => setScenario(e.target.value as LabRun["scenario"])}
              >
                <option value="baseline">Baseline — normal operation</option>
                <option value="slow">Failure drill — slow responses</option>
                <option value="outage">Failure drill — service offline</option>
              </select>
            </label>
            <label className={styles.field}>
              Shared call budget
              <input
                type="number"
                min="1"
                max="200"
                step="1"
                value={Number.isNaN(budget) ? "" : budget}
                disabled={busy}
                onChange={(e) => setBudget(e.target.value === "" ? Number.NaN : Number(e.target.value))}
              />
              <small>1–200 requests across all selected services. Failed attempts count. No monetary charge.</small>
            </label>
            <button
              type="button"
              className={styles.runButton}
              disabled={busy || loading || !services.length || !selected.length || !validBudget}
              onClick={() => void evaluate()}
            >
              {busy ? "Running checks…" : "Run evaluation"}
              <span aria-hidden="true">{busy ? "◌" : "↗"}</span>
            </button>
            <p className={styles.fixtureNote}>
              Uses the existing critic engine. Conversion services share the same 12 exact public checks. Recorded
              probes are visible in this preview.
            </p>
            {history.length > 0 && (
              <div className={styles.history}>
                <h3>Recent runs</h3>
                <p>Last 20, held until the runner restarts.</p>
                {history.slice(0, 5).map((item) => (
                  <button
                    type="button"
                    disabled={busy}
                    key={item.id}
                    aria-pressed={run?.id === item.id}
                    onClick={() => {
                      setRun(item);
                      setActiveService(item.results[0].id);
                      setCaseId(null);
                      setFailedOnly(false);
                    }}
                  >
                    <span>
                      {new Date(item.startedAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <small>
                      {item.scenario} / {item.results.length} services
                    </small>
                  </button>
                ))}
              </div>
            )}
          </aside>
          <section className={styles.workspace} aria-label="Evaluation results" aria-busy={busy}>
            {error && (
              <div className={styles.error} role="alert">
                <strong>Could not complete the request</strong>
                <p>{error}</p>
                <button type="button" onClick={() => void load()}>
                  Reconnect
                </button>
              </div>
            )}
            <div className={styles.resultsHeader}>
              <div>
                <h2>
                  {busy ? "Evaluation in progress" : run ? "Evaluation report" : "Your next trust decision starts here"}
                </h2>
                <p role="status">
                  {busy
                    ? "Calling local services and checking their outputs. This may take a few seconds."
                    : run
                      ? `${run.scenario === "baseline" ? "Baseline" : "Injected failure drill"} · ${new Date(run.startedAt).toLocaleString()} · ${(run.durationMs / 1000).toFixed(2)}s total`
                      : "Choose services on the left, then run your first comparison."}
                </p>
              </div>
              {run && (
                <button type="button" className={styles.exportButton} onClick={download} disabled={busy}>
                  Export evidence ↓
                </button>
              )}
            </div>
            {!run ? (
              <div className={styles.empty}>
                <div className={styles.emptyDiagram} aria-hidden="true">
                  <span>Public checks</span>
                  <div>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                  <span>Private probes</span>
                  <div>
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
                <h3>A perfect public score can hide a broken service.</h3>
                <p>
                  Compare the unit converter with the suite gamer. Both know the advertised answers. Only one should
                  generalize to new inputs.
                </p>
                <div className={styles.method}>
                  <span>
                    Public checks <strong>40%</strong>
                  </span>
                  <span>
                    Probe checks <strong>60%</strong>
                  </span>
                </div>
                <p className={styles.small}>Scores summarize this test set. They are not a safety guarantee.</p>
              </div>
            ) : (
              <>
                <div className={styles.metrics}>
                  <div>
                    <span>Checks passed</span>
                    <strong>
                      {checks.filter((c) => c.passed).length}
                      <small> / {checks.length}</small>
                    </strong>
                  </div>
                  <div>
                    <span>HTTP attempts</span>
                    <strong>
                      {run.calls}
                      <small> / {run.budget}</small>
                    </strong>
                  </div>
                  <div>
                    <span>Services evaluated</span>
                    <strong>
                      {run.results.filter((r) => !r.error).length}
                      <small> / {run.results.length}</small>
                    </strong>
                  </div>
                </div>
                <div className={styles.comparisons}>
                  {run.results.map((r) => (
                    <button
                      type="button"
                      disabled={busy}
                      key={r.id}
                      aria-pressed={r.id === activeService}
                      className={styles.comparison}
                      onClick={() => {
                        setActiveService(r.id);
                        setCaseId(null);
                      }}
                    >
                      <div className={styles.scoreTitle}>
                        <strong>{r.name}</strong>
                        <span className={r.error || (r.score ?? 0) < 70 ? styles.lowScore : styles.highScore}>
                          {r.score ?? "—"}
                          <small>/100</small>
                        </span>
                      </div>
                      {r.error ? (
                        <p className={styles.resultError}>{r.error}</p>
                      ) : (
                        <>
                          <div className={styles.barRow}>
                            <span>Public</span>
                            <div>
                              <i style={{ width: `${r.publicPass}%` }} />
                            </div>
                            <b>{percent(r.publicPass)}</b>
                          </div>
                          <div className={`${styles.barRow} ${styles.probeBar}`}>
                            <span>Probes</span>
                            <div>
                              <i style={{ width: `${r.probePass}%` }} />
                            </div>
                            <b>{percent(r.probePass)}</b>
                          </div>
                          <small>40% public + 60% probes</small>
                        </>
                      )}
                    </button>
                  ))}
                </div>
                {result?.evidence && (
                  <div className={styles.evidence}>
                    <div className={styles.evidenceHeading}>
                      <div>
                        <h3>{result.name}: behind the score</h3>
                        <p>
                          p50 {result.evidence.latencyMs.p50.toFixed(1)} ms / p95{" "}
                          {result.evidence.latencyMs.p95.toFixed(1)} ms · local HTTP response latency
                        </p>
                      </div>
                      <label>
                        <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />{" "}
                        Failed only
                      </label>
                    </div>
                    <div className={styles.feedback}>
                      <strong>What to investigate</strong>
                      <p>{result.recommendation}</p>
                    </div>
                    <div className={styles.caseList}>
                      {visibleCases.map((c) => (
                        <button
                          type="button"
                          key={`${c.phase}-${c.id}`}
                          aria-expanded={caseId === `${c.phase}-${c.id}`}
                          onClick={() => setCaseId(caseId === `${c.phase}-${c.id}` ? null : `${c.phase}-${c.id}`)}
                        >
                          <span className={c.passed ? styles.pass : styles.fail}>{c.passed ? "Pass" : "Fail"}</span>
                          <span>
                            {c.id}
                            <small>{c.phase === "public" ? "Public check" : "Probe fixture"}</small>
                          </span>
                          <span>{c.latencyMs.toFixed(1)} ms</span>
                          <span aria-hidden="true">{caseId === `${c.phase}-${c.id}` ? "−" : "+"}</span>
                        </button>
                      ))}
                    </div>
                    {visibleCases.length === 0 && (
                      <p className={styles.noFailures}>No failed checks in this service’s completed evaluation.</p>
                    )}
                    {inspected && (
                      <section className={styles.inspector} aria-label="Case evidence">
                        <h4>{inspected.id}</h4>
                        <div>
                          <section>
                            <h5>Input</h5>
                            <pre>{json(inspected.input)}</pre>
                          </section>
                          <section>
                            <h5>Expected check</h5>
                            <pre>{json(inspected.expected)}</pre>
                          </section>
                          <section>
                            <h5>Actual output</h5>
                            <pre>{inspected.error ?? json(inspected.output)}</pre>
                          </section>
                        </div>
                      </section>
                    )}
                    <details className={styles.digest}>
                      <summary>Evidence fingerprint</summary>
                      <code>{result.evidenceHash}</code>
                      <p>
                        SHA-256 of canonical evidence, including measured timings. An integrity fingerprint, not proof
                        of truth or a blockchain attestation.
                      </p>
                    </details>
                  </div>
                )}
                <p className={styles.resultNote}>
                  Preview methodology: published fixture probes, one local critic, no model calls. This run does not
                  exercise staking, rewards, World verification, ENS publication or live x402 settlement. CSV’s
                  empty-output judge case uses an exact empty-string check here.
                </p>
              </>
            )}
          </section>
        </div>
      )}
      <footer className={styles.footer}>
        <span>skeptique / test before you trust</span>
        <span>Evaluation today. Better agents tomorrow.</span>
      </footer>
    </div>
  );
}
