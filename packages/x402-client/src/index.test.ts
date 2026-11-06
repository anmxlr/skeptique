import { describe, expect, it, vi } from 'vitest';
import { createLocalPayAndCall } from './index';

describe('local payAndCall', () => {
  it('denies in onBeforePay without calling the service', async () => {
    const fetchImpl = vi.fn();
    const call = createLocalPayAndCall({ priceFor: async () => '2', onBeforePay: async () => false, fetchImpl });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '5', signer: {} })).rejects.toThrow('Payment denied');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('enforces maxPrice and reports local mode without a transaction', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ answer: 2 }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const call = createLocalPayAndCall({ priceFor: async () => '2', fetchImpl });
    await expect(call({ url: 'http://local/call', body: {}, maxPrice: '1', signer: {} })).rejects.toThrow('Price exceeds maxPrice');
    expect(await call({ url: 'http://local/call', body: {}, maxPrice: '2', signer: {} })).toEqual({ response: { answer: 2 }, txId: null, paid: false });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
