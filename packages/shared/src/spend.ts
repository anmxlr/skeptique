import { z } from "zod";

const atomic = z.string().regex(/^(0|[1-9]\d*)$/);

/** What the buyer's owner lets it spend on its own, in tinybars. Anything above the threshold needs a human. */
export const SpendLimitsSchema = z.object({
  budget: atomic,
  perMerchantCap: atomic,
  allowlist: z.array(z.string().min(1).max(200)).max(100),
  approvalThreshold: atomic,
});
export type SpendLimits = z.infer<typeof SpendLimitsSchema>;

export const ApprovalStatusSchema = z.enum(["pending", "approved", "denied"]);

/** A payment above the approval threshold, waiting in the queue for a human. */
export const ApprovalSchema = z.object({
  id: z.string().min(1),
  merchant: z.string().min(1).max(200),
  amount: atomic,
  status: ApprovalStatusSchema,
  createdAt: z.string(),
});
export type Approval = z.infer<typeof ApprovalSchema>;

export const ApprovalRequestSchema = ApprovalSchema.pick({ merchant: true, amount: true });
