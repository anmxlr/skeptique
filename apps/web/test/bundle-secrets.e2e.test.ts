import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const webDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const example = readFileSync(join(webDir, "../../.env.example"), "utf8");
const keys = [...example.matchAll(/^([A-Z][A-Z0-9_]*)=/gm)].map((match) => match[1] as string);
const SECRETISH = /SECRET|PRIVATE|SIGNING|PASSWORD|TOKEN|API_KEY/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

describe("world onboarding: no server secret in the client bundle", () => {
  it("no secret-looking variable is exposed to the browser", () => {
    expect(keys.filter((key) => key.startsWith("NEXT_PUBLIC_") && SECRETISH.test(key))).toEqual([]);
  });

  it("a production build embeds none of the server's secret values and none of the server-side signing code", () => {
    // Every variable in .env.example gets a unique marker value, public ones included: the build may only
    // inline NEXT_PUBLIC_ values, and none of those may be a secret.
    const marker = randomBytes(6).toString("hex");
    const env: NodeJS.ProcessEnv = { ...process.env };
    const secrets = new Map<string, string>();
    for (const key of keys) {
      const value = `LEAK_${marker}_${key}`;
      env[key] = value;
      if (!key.startsWith("NEXT_PUBLIC_")) secrets.set(key, value);
    }
    const build = spawnSync("pnpm", ["exec", "next", "build"], {
      cwd: webDir,
      env,
      encoding: "utf8",
      shell: process.platform === "win32",
      timeout: 280_000,
    });
    expect(build.status, `${build.stdout}\n${build.stderr}`).toBe(0);

    const leaked: string[] = [];
    for (const path of files(join(webDir, ".next/static"))) {
      if (!/\.(js|css|json|html|txt|map)$/.test(path)) continue;
      const text = readFileSync(path, "utf8");
      for (const [key, value] of secrets) if (text.includes(value)) leaked.push(`${key} in ${path}`);
      if (text.includes("signingKeyHex")) leaked.push(`idkit-server signing code in ${path}`);
    }
    expect(leaked).toEqual([]);
  }, 300_000);
});
