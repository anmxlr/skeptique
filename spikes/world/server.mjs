// Spike backend for World ID 4.0 (spec/notes/world.md).
// Holds the signing key; the client only ever sees the signed rp_context.
import { createServer } from 'node:http';
import { signRequest } from '@worldcoin/idkit-server';

export function createWorldServer({ rpId, signingKey, action, environment }) {
  const usedNullifiers = new Set();

  const routes = {
    'POST /world/rp-context': async () => {
      const { sig, nonce, createdAt, expiresAt } = signRequest({ signingKeyHex: signingKey, action });
      return [200, { rp_id: rpId, nonce, created_at: createdAt, expires_at: expiresAt, signature: sig }];
    },
    'POST /world/verify': async (_body) => [501, { reason: 'not_implemented' }],
  };

  return createServer(async (req, res) => {
    const handler = routes[`${req.method} ${req.url}`];
    let status = 404;
    let payload = { reason: 'not_found' };
    if (handler) {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const raw = Buffer.concat(chunks).toString();
      [status, payload] = await handler(raw ? JSON.parse(raw) : {});
    }
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
}
