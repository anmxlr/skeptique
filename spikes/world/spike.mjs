// Ticket 05 spike: one World ID 4.0 staging proof validated on our server,
// one denied case rejected on our server. Run: node spike.mjs
// Connector URLs carry the bridge key and are never printed.
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';
import { IDKit, proofOfHuman } from '@worldcoin/idkit-core';
import { createWorldServer } from './server.mjs';

config({ path: fileURLToPath(new URL('../../.env', import.meta.url)), quiet: true });

const SIMULATOR_MCP = 'https://simulator.worldcoin.org/api/mcp';
const ACTION = 'register-critic';
const ENVIRONMENT = 'staging';
const SIGNAL = 'spike-05-critic';
const VERIFY_BASE = 'https://developer.world.org';

const need = (k) => {
  if (!process.env[k]) throw new Error(`missing env ${k}`);
  return process.env[k];
};
const appId = need('WORLD_APP_ID');
const rpId = need('WORLD_RP_ID');
const signingKey = need('WORLD_SIGNING_KEY');

const results = [];
const check = (name, ok, detail) => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: ${detail}`);
};

async function simulatorComplete(connectUrl) {
  const res = await fetch(SIMULATOR_MCP, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'complete_test_request', arguments: { connect_url: connectUrl } },
    }),
  });
  const text = await res.text();
  const line = text.split('\n').find((l) => l.startsWith('data: '));
  const msg = JSON.parse(line ? line.slice(6) : text);
  return JSON.parse(msg.result?.content?.[0]?.text ?? JSON.stringify(msg.error ?? msg));
}

const server = createWorldServer({ rpId, signingKey, action: ACTION, environment: ENVIRONMENT, verifyBase: VERIFY_BASE });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const post = async (path, body) => {
  const res = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body ?? {}) });
  return { status: res.status, body: await res.json() };
};

try {
  console.log(`spike 05 ${new Date().toISOString()} environment=${ENVIRONMENT} action=${ACTION} verify=${VERIFY_BASE}`);

  // 1. Server signs the request; client builds the IDKit request from it.
  const ctx = await post('/world/rp-context');
  console.log(`rp-context: status=${ctx.status} expires_in=${ctx.body.expires_at - ctx.body.created_at}s`);
  const request = await IDKit.request({
    app_id: appId,
    action: ACTION,
    rp_context: ctx.body,
    allow_legacy_proofs: false,
    environment: ENVIRONMENT,
  }).preset(proofOfHuman({ signal: SIGNAL }));
  console.log(`idkit request created: request_id=${request.requestId}`);

  // 2. The simulator plays the user's phone and delivers a real staging proof.
  const sim = await simulatorComplete(request.connectorURI);
  console.log(`simulator: ${JSON.stringify(sim)}`);

  // 3. Client receives the proof via the bridge.
  const done = await request.pollUntilCompletion({ timeout: 180_000 });
  if (!done.success) throw new Error(`idkit completion failed: ${done.error}`);
  const proof = done.result;
  console.log(`idkit result: protocol=${proof.protocol_version} environment=${proof.environment} responses=${proof.responses?.length}`);

  // 4. Success path: server validates with World, returns the per-human id.
  const ok = await post('/world/verify', proof);
  check('valid proof accepted by server', ok.status === 200 && !!ok.body.nullifier, `status=${ok.status} ${JSON.stringify(ok.body)}`);

  // 5. Denied path A: tampered proof, rejected by World's verifier via our server.
  const tampered = structuredClone(proof);
  const p0 = tampered.responses[0].proof[0];
  tampered.responses[0].proof[0] = p0.slice(0, -1) + (p0.at(-1) === '1' ? '2' : '1');
  const bad = await post('/world/verify', tampered);
  check('tampered proof denied by server', bad.status === 403, `status=${bad.status} ${JSON.stringify(bad.body)}`);

  // 6. Denied path B: same human registers a second time (nullifier replay).
  const again = await post('/world/verify', proof);
  check('replayed nullifier denied by server', again.status === 403, `status=${again.status} ${JSON.stringify(again.body)}`);
} catch (err) {
  check('spike ran', false, err.message);
} finally {
  server.close();
}

const failed = results.filter((r) => !r).length;
console.log(failed ? `RESULT: ${failed} check(s) failed` : 'RESULT: all checks passed');
process.exitCode = failed ? 1 : 0;
