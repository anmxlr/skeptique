#!/usr/bin/env node
// Fails, naming each key, when .env (or the process env) lacks a value for any key in .env.example.
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @param {string} text @returns {Map<string, string>} */
export function parseEnv(text) {
  const vars = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (/^(["']).*\1$/.test(value)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars.set(match[1], value);
  }
  return vars;
}

/**
 * @param {string} exampleText contents of .env.example
 * @param {string} envText contents of .env ("" when absent)
 * @param {Record<string, string | undefined>} [processEnv]
 * @returns {string[]} keys with no non-empty value
 */
export function missingKeys(exampleText, envText, processEnv = {}) {
  const env = parseEnv(envText);
  return [...parseEnv(exampleText).keys()].filter((key) => !(env.get(key) || processEnv[key]));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const examplePath = join(root, ".env.example");
  const envPath = join(root, ".env");
  const example = readFileSync(examplePath, "utf8");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const missing = missingKeys(example, env, process.env);
  if (missing.length > 0) {
    console.error(`env check failed: ${missing.length} missing variable(s):`);
    for (const key of missing) console.error(`  - ${key}`);
    process.exit(1);
  }
  console.log(`env check ok: ${parseEnv(example).size} variables set`);
}
