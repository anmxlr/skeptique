"use client";

import { type FormEvent, useState } from "react";
import { ListingError, type ListingForm, listService, previewSuite, suiteUrlFor } from "../lib/sell";

const empty: ListingForm = { name: "", category: "", endpoint: "", price: "", suiteUrl: "", fee: "" };

export function SellForm() {
  const [form, setForm] = useState<ListingForm>(empty);
  const [suiteHash, setSuiteHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const set = (key: keyof ListingForm) => (event: { target: { value: string } }) => {
    const value = event.target.value;
    setSuiteHash(null);
    setForm((current) => ({
      ...current,
      [key]: value,
      // The suite defaults to the file next to the endpoint, which is where the API reads it.
      ...(key === "endpoint" ? { suiteUrl: suiteUrlFor(value) ?? "" } : {}),
    }));
  };

  async function show(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      setSuiteHash((await previewSuite(form.suiteUrl)).specHash);
    } catch (cause) {
      setSuiteHash(null);
      setError(cause instanceof Error ? cause.message : "Could not read the suite.");
    }
  }

  async function submit() {
    setError(null);
    const provider = (window as { ethereum?: Parameters<typeof listService>[0]["provider"] }).ethereum;
    const registry = process.env.NEXT_PUBLIC_SERVICE_REGISTRY as `0x${string}` | undefined;
    if (!provider) return setError("No wallet found. Install a browser wallet to list a service.");
    if (!registry) return setError("NEXT_PUBLIC_SERVICE_REGISTRY must be set");
    setBusy(true);
    try {
      const { serviceId } = await listService({ provider, registry, form });
      window.location.assign(`/services/${serviceId}`);
    } catch (cause) {
      setError(cause instanceof ListingError ? cause.message : "The listing failed.");
      setBusy(false);
    }
  }

  const field = (key: keyof ListingForm, label: string, hint?: string) => (
    <label className="market-field">
      {label}
      <input value={form[key]} onChange={set(key)} required aria-describedby={hint ? `${key}-hint` : undefined} />
      {hint ? <small id={`${key}-hint`}>{hint}</small> : null}
    </label>
  );

  return (
    <form onSubmit={show}>
      {field("name", "Name")}
      {field("category", "Category")}
      {field("endpoint", "Endpoint", "The x402-paywalled /call URL.")}
      {field("price", "Price per call (HBAR)")}
      {field("suiteUrl", "Public suite URL", "Critics test against this suite; its hash is locked on-chain.")}
      {field("fee", "Listing fee (HBAR)", "Funds the bounty. There is a minimum, and the seller cannot withdraw it.")}
      <button type="submit">Show suite hash</button>
      {suiteHash ? (
        <p>
          Suite hash: <code>{suiteHash}</code>
        </p>
      ) : null}
      <button type="button" onClick={submit} disabled={busy || !suiteHash}>
        {busy ? "Waiting for wallet…" : "List service"}
      </button>
      {error ? <p role="alert">{error}</p> : null}
    </form>
  );
}
