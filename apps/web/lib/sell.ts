import { suiteHash, type TestSuite, TestSuiteSchema } from "@skeptique/shared";
import { serviceRegistryAbi } from "@skeptique/shared/abi/ServiceRegistry";
import { createPublicClient, createWalletClient, custom, type EIP1193Provider, parseEventLogs, zeroHash } from "viem";
import { formatHbar } from "../components/marketplace";

export interface ListingForm {
  name: string;
  category: string;
  endpoint: string;
  /** Price per call, in HBAR. */
  price: string;
  suiteUrl: string;
  /** Listing fee that becomes the bounty, in HBAR. */
  fee: string;
}

export type ListingErrorKind = "invalid" | "suite" | "rejected" | "failed";

export class ListingError extends Error {
  constructor(
    readonly kind: ListingErrorKind,
    message: string,
  ) {
    super(message);
  }
}

const TINYBARS_PER_HBAR = 10n ** 8n;

/** Decimal HBAR -> tinybars (the contract unit), or null when it is not a non-negative amount with <= 8 decimals. */
export function parseHbar(text: string): bigint | null {
  const match = /^(\d+)(?:\.(\d{1,8}))?$/.exec(text.trim());
  if (!match) return null;
  return BigInt(match[1]) * TINYBARS_PER_HBAR + BigInt((match[2] ?? "").padEnd(8, "0") || "0");
}

/** The public suite lives next to the endpoint: `<endpoint>/../suite.json` (what the API indexer reads). */
export function suiteUrlFor(endpoint: string): string | null {
  try {
    return new URL("../suite.json", endpoint).toString();
  } catch {
    return null;
  }
}

function isHttpUrl(text: string): boolean {
  try {
    return ["http:", "https:"].includes(new URL(text).protocol);
  } catch {
    return false;
  }
}

/** Fetches the seller's public suite and returns it with the hash that will be locked on-chain. Throws ListingError("suite"). */
export async function previewSuite(
  suiteUrl: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ suite: TestSuite; specHash: `0x${string}` }> {
  if (!isHttpUrl(suiteUrl)) throw new ListingError("suite", "Suite URL must be an http(s) URL.");
  let res: Response;
  try {
    res = await fetchImpl(suiteUrl);
  } catch {
    throw new ListingError("suite", `Could not reach the suite at ${suiteUrl}.`);
  }
  if (!res.ok) throw new ListingError("suite", `The suite URL responded ${res.status}.`);
  const parsed = TestSuiteSchema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) throw new ListingError("suite", "The suite URL does not serve a valid test suite.");
  return { suite: parsed.data, specHash: suiteHash(parsed.data) };
}

function rejectedByUser(error: unknown): boolean {
  let cause = error as { code?: unknown; name?: string; cause?: unknown } | undefined;
  while (cause) {
    if (cause.code === 4001 || cause.name === "UserRejectedRequestError") return true;
    cause = cause.cause as typeof cause;
  }
  return false;
}

export interface ListServiceInput {
  /** The seller's wallet (EIP-1193), e.g. window.ethereum. */
  provider: Pick<EIP1193Provider, "request">;
  registry: `0x${string}`;
  form: ListingForm;
  fetchImpl?: typeof fetch;
}

/** Checks, then submits the listing from the seller's wallet. Nothing is sent unless every check passes. */
export async function listService({ provider, registry, form, fetchImpl }: ListServiceInput) {
  const transport = custom(provider as EIP1193Provider);
  const reader = createPublicClient({ transport });

  const fee = parseHbar(form.fee);
  const price = parseHbar(form.price);
  if (fee === null) throw new ListingError("invalid", "Fee must be an amount in HBAR.");
  if (price === null) throw new ListingError("invalid", "Price must be an amount in HBAR.");
  if (!form.name.trim() || !form.category.trim()) {
    throw new ListingError("invalid", "Name and category are required.");
  }
  if (!isHttpUrl(form.endpoint)) throw new ListingError("invalid", "Endpoint must be an http(s) URL.");

  const minFee = await reader.readContract({
    address: registry,
    abi: serviceRegistryAbi,
    functionName: "minListingFee",
  });
  if (fee < minFee) {
    throw new ListingError(
      "invalid",
      `Fee must be at least ${formatHbar(minFee.toString())}, the minimum listing fee.`,
    );
  }

  const expectedSuiteUrl = suiteUrlFor(form.endpoint);
  if (form.suiteUrl !== expectedSuiteUrl) {
    throw new ListingError("suite", `The suite must be served at ${expectedSuiteUrl}, next to the endpoint.`);
  }
  const { suite, specHash } = await previewSuite(form.suiteUrl, fetchImpl);
  if (suite.serviceName !== form.name.trim() || suite.category !== form.category.trim()) {
    throw new ListingError("suite", "Name and category must match the published suite.");
  }

  const wallet = createWalletClient({ transport });
  const [account] = await wallet.requestAddresses().catch((error) => {
    throw rejectedByUser(error)
      ? new ListingError("rejected", "Wallet connection was rejected, so no listing was created.")
      : error;
  });
  if (!account) throw new ListingError("failed", "The wallet has no account to list from.");

  try {
    const hash = await wallet.writeContract({
      chain: null,
      account,
      address: registry,
      abi: serviceRegistryAbi,
      functionName: "listService",
      args: [specHash, form.endpoint, price, zeroHash],
      value: fee,
    });
    const receipt = await reader.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new ListingError("failed", "The listing transaction reverted.");
    const [event] = parseEventLogs({ abi: serviceRegistryAbi, logs: receipt.logs, eventName: "ServiceListed" });
    if (!event) throw new ListingError("failed", "The listing transaction did not emit ServiceListed.");
    return { serviceId: Number(event.args.serviceId), txHash: hash, specHash };
  } catch (error) {
    if (error instanceof ListingError) throw error;
    if (rejectedByUser(error)) {
      throw new ListingError("rejected", "Transaction rejected in your wallet, so no listing was created.");
    }
    const reason = (error as { shortMessage?: string }).shortMessage ?? (error as Error).message;
    throw new ListingError("failed", `The listing failed: ${reason}`);
  }
}
