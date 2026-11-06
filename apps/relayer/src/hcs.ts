import { type AuditMessage, auditKey, encodeAuditMessage } from "@skeptique/shared/hcs";

export interface TopicPublisher {
  submit(json: string): Promise<void>;
  /** Keys of events already on the topic, read back from the mirror node. */
  postedKeys(): Promise<Set<string>>;
}

/**
 * Posts audit events once each. The topic itself is the checkpoint: keys are loaded from it on first use,
 * so replaying events after a restart does not post twice.
 */
export function createAuditLog(publisher: TopicPublisher) {
  let seen: Promise<Set<string>> | undefined;
  let tail: Promise<unknown> = Promise.resolve();
  return {
    post(message: AuditMessage): Promise<{ posted: boolean }> {
      const run = async () => {
        const json = encodeAuditMessage(message);
        seen ??= publisher.postedKeys();
        const keys = await seen;
        const key = auditKey(message);
        if (keys.has(key)) return { posted: false };
        await publisher.submit(json);
        keys.add(key);
        return { posted: true };
      };
      const next = tail.then(run, run);
      tail = next.catch(() => {});
      return next;
    },
  };
}
