import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const web = fileURLToPath(new URL("..", import.meta.url));
const example = readFileSync(join(web, "..", "..", ".env.example"), "utf8");

/** Every server-only value .env.example declares: keys, secrets, signing keys. */
const SECRET_KEYS = [...example.matchAll(/^([A-Z0-9_]+)=/gm)]
  .map(([, key]) => key as string)
  .filter((key) => /PRIVATE_KEY|SECRET|SIGNING_KEY|API_KEY/.test(key));

/** Files a browser can download: client chunks plus prerendered HTML and RSC payloads. */
function clientFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return clientFiles(path);
    return /\.(js|css|html|rsc|json|txt|body|map)$/.test(entry.name) ? [path] : [];
  });
}

describe("web bundle secrets", () => {
  it("no server secret from .env.example reaches the built client bundle", () => {
    expect(SECRET_KEYS).toEqual(expect.arrayContaining(["WORLD_SIGNING_KEY", "ATTESTOR_PRIVATE_KEY"]));
    const secrets = Object.fromEntries(SECRET_KEYS.map((key) => [key, `0x${randomBytes(32).toString("hex")}`]));
    const canary = `http://canary-${randomBytes(6).toString("hex")}.test`;

    const build = spawnSync("pnpm", ["exec", "next", "build"], {
      cwd: web,
      env: { ...process.env, ...secrets, NEXT_PUBLIC_API_URL: canary },
      encoding: "utf8",
      shell: process.platform === "win32",
    });
    expect(build.status, build.stderr || build.stdout).toBe(0);

    const files = [...clientFiles(join(web, ".next", "static")), ...clientFiles(join(web, ".next", "server", "app"))];
    const bundle = files.map((file) => readFileSync(file, "utf8")).join("\n");
    // Positive control: a public value the client does use must be found, so the scan is looking in the right place.
    expect(bundle).toContain(canary);
    const leaked = Object.entries(secrets)
      .filter(([, value]) => bundle.includes(value) || bundle.includes(value.slice(2)))
      .map(([key]) => key);
    expect(leaked).toEqual([]);
  }, 300_000);
});
