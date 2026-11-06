import { z } from "zod";

const atomic = z.string().regex(/^(0|[1-9]\d*)$/);
const id = z.string().regex(/^[1-9]\d*$/);
const ts = z.number().int().nonnegative();

export const AuditMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("round_finalized"),
    roundId: id,
    serviceId: id,
    median: z.number().int().min(0).max(100),
    nReveals: z.number().int().min(0).max(255),
    isVoid: z.boolean(),
    ts,
  }),
  z.object({
    type: z.literal("critic_slashed"),
    critic: z.string().regex(/^0x[0-9a-fA-F]{40}$/),
    roundId: id,
    amount: atomic,
    reason: z.string().max(200),
    ts,
  }),
  z.object({
    type: z.literal("agent_spend"),
    payer: z.string().min(1).max(100),
    merchant: z.string().min(1).max(100),
    amount: atomic,
    txId: z.string().min(1).max(100),
    ts,
  }),
]);
export type AuditMessage = z.infer<typeof AuditMessageSchema>;

/** Identity of the event behind a message; two messages with one key are the same event. */
export function auditKey(message: AuditMessage): string {
  switch (message.type) {
    case "round_finalized":
      return `round_finalized:${message.roundId}`;
    case "critic_slashed":
      return `critic_slashed:${message.roundId}:${message.critic.toLowerCase()}`;
    case "agent_spend":
      return `agent_spend:${message.txId}`;
  }
}

/** Validates and serialises a message; HCS limits one message to 1024 bytes before chunking. */
export function encodeAuditMessage(message: AuditMessage): string {
  const json = JSON.stringify(AuditMessageSchema.parse(message));
  if (new TextEncoder().encode(json).length > 1024) throw new Error("Audit message exceeds 1024 bytes");
  return json;
}

export interface AuditEntry {
  sequenceNumber: number;
  consensusTimestamp: string;
  message: AuditMessage;
  /** HashScan has no documented topic-message URL, so link the mirror REST row for this message. */
  mirrorUrl: string;
}

type Fetch = (url: string) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

const MirrorPageSchema = z.object({
  messages: z.array(
    z.object({
      consensus_timestamp: z.string(),
      message: z.string(),
      sequence_number: z.number().int(),
    }),
  ),
});

function decodeBase64(value: string): string {
  const bytes = Uint8Array.from(atob(value), (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Reads the audit topic straight from the mirror node, newest first. Rows that are not valid audit messages are skipped. */
export async function readAuditLog(options: {
  mirrorUrl: string;
  topicId: string;
  limit?: number;
  fetch?: Fetch;
}): Promise<AuditEntry[]> {
  const base = options.mirrorUrl.replace(/\/+$/, "");
  const doFetch: Fetch = options.fetch ?? ((url) => fetch(url));
  const response = await doFetch(
    `${base}/api/v1/topics/${options.topicId}/messages?order=desc&limit=${options.limit ?? 50}`,
  );
  if (!response.ok) throw new Error(`Mirror node responded ${response.status}`);
  const page = MirrorPageSchema.parse(await response.json());
  const entries: AuditEntry[] = [];
  for (const row of page.messages) {
    let parsed: ReturnType<typeof AuditMessageSchema.safeParse>;
    try {
      parsed = AuditMessageSchema.safeParse(JSON.parse(decodeBase64(row.message)));
    } catch {
      continue;
    }
    if (!parsed.success) continue;
    entries.push({
      sequenceNumber: row.sequence_number,
      consensusTimestamp: row.consensus_timestamp,
      message: parsed.data,
      mirrorUrl: `${base}/api/v1/topics/${options.topicId}/messages/${row.sequence_number}`,
    });
  }
  return entries;
}
