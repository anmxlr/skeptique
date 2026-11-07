import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { z } from "zod";

export type LlmAnswer<T> = { value: T; model: string; costUsd: number | null; ms: number; raw: string };

/** A structured-output model call. The arena never lets a model grade answers, only choose. */
export interface Llm {
  readonly model: string;
  ask<T>(args: { system: string; prompt: string; schema: z.ZodType<T> }): Promise<LlmAnswer<T>>;
}

export class LlmError extends Error {}

const CliOutputSchema = z.object({
  is_error: z.boolean(),
  result: z.string().optional(),
  structured_output: z.unknown().optional(),
  total_cost_usd: z.number().optional(),
});

/**
 * Only what the CLI needs to find itself and its login: never the buyer's keys. With a user `apiKey`,
 * the server's own Anthropic credentials are dropped so the call is billed to the user's key.
 */
export const childEnv = (apiKey?: string): Record<string, string | undefined> => {
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        ["PATH", "HOME", "USER", "LANG", "TERM"].includes(key) ||
        (!apiKey && (key.startsWith("ANTHROPIC_") || key.startsWith("CLAUDE_"))),
    ),
  );
  return apiKey ? { ...env, ANTHROPIC_API_KEY: apiKey } : env;
};

type ClaudeCliOptions = { model?: string; bin?: string; timeoutMs?: number; retries?: number; apiKey?: string };

/**
 * Runs `claude -p` in safe mode with no tools, no MCP servers, no settings and no saved session, from
 * a temp dir with a minimal env, so the only thing the model can do is answer in the given JSON schema.
 */
export function createClaudeCliLlm({
  model = "claude-haiku-5-5",
  bin = "claude",
  timeoutMs = 45_000,
  retries = 1,
  apiKey,
}: ClaudeCliOptions = {}): Llm {
  const once = (system: string, prompt: string, jsonSchema: string) =>
    new Promise<string>((resolve, reject) => {
      const child = spawn(
        bin,
        [
          "-p",
          "--model",
          model,
          "--system-prompt",
          system,
          "--output-format",
          "json",
          "--json-schema",
          jsonSchema,
          "--tools",
          "",
          "--no-session-persistence",
          "--setting-sources",
          "",
          "--strict-mcp-config",
          "--safe-mode",
        ],
        { stdio: ["pipe", "pipe", "pipe"], cwd: tmpdir(), env: childEnv(apiKey) },
      );
      let out = "";
      let err = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new LlmError(`claude CLI timed out after ${timeoutMs} ms`));
      }, timeoutMs);
      child.stdout.on("data", (chunk) => {
        out += chunk;
      });
      child.stderr.on("data", (chunk) => {
        err += chunk;
      });
      child.on("error", (error) => {
        clearTimeout(timer);
        reject(new LlmError(`claude CLI failed to start: ${error.message}`));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve(out);
        else reject(new LlmError(`claude CLI exited ${code}: ${err.slice(0, 300)}`));
      });
      child.stdin.on("error", () => {}); // the close handler reports a child that died early
      child.stdin.end(prompt);
    });

  return {
    model,
    async ask({ system, prompt, schema }) {
      // The CLI's validator does not resolve the draft-2020-12 meta-schema URI, so drop it.
      const { $schema: _meta, ...plain } = z.toJSONSchema(schema) as Record<string, unknown>;
      const jsonSchema = JSON.stringify(plain);
      let lastError: unknown;
      for (let attempt = 0; attempt <= retries; attempt++) {
        const started = Date.now();
        try {
          const raw = await once(system, prompt, jsonSchema);
          const cli = CliOutputSchema.parse(JSON.parse(raw));
          if (cli.is_error) throw new LlmError(`model returned an error: ${cli.result ?? "unknown"}`);
          const value = schema.parse(cli.structured_output);
          return {
            value,
            model,
            costUsd: cli.total_cost_usd ?? null,
            ms: Date.now() - started,
            raw: JSON.stringify(cli.structured_output),
          };
        } catch (error) {
          lastError = error;
        }
      }
      throw lastError instanceof LlmError
        ? lastError
        : new LlmError(`model answer failed validation: ${String((lastError as Error)?.message ?? lastError)}`);
    },
  };
}
