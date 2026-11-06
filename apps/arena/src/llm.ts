import { spawn } from "node:child_process";
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

type ClaudeCliOptions = { model?: string; bin?: string; timeoutMs?: number; retries?: number };

/**
 * Runs `claude -p` with no tools, no MCP servers, no settings and no saved session, so the only
 * thing the model can do is answer the given prompt in the given JSON schema.
 */
export function createClaudeCliLlm({
  model = "claude-haiku-5-5",
  bin = "claude",
  timeoutMs = 45_000,
  retries = 1,
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
        ],
        { stdio: ["pipe", "pipe", "pipe"] },
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
