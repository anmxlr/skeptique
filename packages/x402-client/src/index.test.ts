import { describe, expect, it, vi } from 'vitest';
import { createLocalPayAndCall } from './index';

describe('local payAndCall', () => {
  it('bounds a stalled quote and never starts a late service request', async () => {
    let finishQuote!: (price: string) => void;
    const fetchImpl = vi.fn();
    const call = createLocalPayAndCall({ priceFor: () => new Promise(resolve => { finishQuote = resolve; }), fetchImpl, timeoutMs: 5 });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '5', signer: {} })).rejects.toThrow(/timed out/);
    finishQuote('2');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses an already cancelled call before asking for a quote', async () => {
    const priceFor = vi.fn(async () => '2');
    const call = createLocalPayAndCall({ priceFor });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '5', signer: {}, signal: AbortSignal.abort(new Error('Cancelled')) })).rejects.toThrow('Cancelled');
    expect(priceFor).not.toHaveBeenCalled();
  });
  it('denies in onBeforePay without calling the service', async () => {
    const fetchImpl = vi.fn();
    const call = createLocalPayAndCall({ priceFor: async () => '2', onBeforePay: async () => false, fetchImpl });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '5', signer: {} })).rejects.toThrow('Payment denied');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces maxPrice and reports local mode without a transaction', async () => {
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) => new Response(JSON.stringify({ answer: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const call = createLocalPayAndCall({ priceFor: async () => '2', fetchImpl });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '1', signer: {} })).rejects.toThrow('Price exceeds maxPrice');
    expect(await call({ url: 'http://local/call', body: { value: 2 }, maxPrice: '2', signer: {}, criticCall: true })).toEqual({ response: { answer: 2 }, txId: null, paid: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0]![1]).toMatchObject({ body: JSON.stringify({ value: 2 }), headers: { 'x-skeptic-call-role': 'critic' } });
  });
});
