// The small decisions pip-work makes around a job, kept pure so they are tested without a network (worker.test.ts).
import type { FillCode, Out } from "./engine.ts";

/** Every answer the vault service may give. Anything else is treated as "unavailable". */
export const FILL_CODES: FillCode[] = ["submitted", "filled", "wrong_site", "no_form", "no_login", "no_code", "vault_failed", "unavailable"];

/** How a job is given back after a step said what comes next. */
export function nextRelease(out: Out): { status: "queued" | "waiting_owner" | "waiting_approval" | "done" | "failed"; runAfterSeconds: number } {
  switch (out.next) {
    case "again": return { status: "queued", runAfterSeconds: Math.max(0, Math.min(out.waitSeconds ?? 0, 3600)) };
    case "owner": return { status: "waiting_owner", runAfterSeconds: 0 };
    case "approval": return { status: "waiting_approval", runAfterSeconds: 0 };
    case "done": return { status: "done", runAfterSeconds: 0 };
    default: return { status: "failed", runAfterSeconds: 0 };
  }
}

/** The founder's failure email: the job and the reason, in plain words. Built only from Pip's own fields. */
export function failureEmail(j: { id: string; business_id: string; kind: string; title: string; reason?: string | null; summary?: string | null; step?: number; cost_usd?: number; finished_at?: string | null; businesses?: { name?: string } | null }): { subject: string; text: string } {
  const biz = j.businesses?.name || j.business_id;
  return {
    subject: `Pip background job failed: ${j.title}`.slice(0, 160),
    text: [
      `A background job failed and has stopped.`,
      ``,
      `Business: ${biz}`,
      `Job: ${j.title} (${j.kind})`,
      `Reason: ${j.reason || "No reason was recorded."}`,
      `What the owner was told: ${j.summary || "Nothing yet."}`,
      `Steps taken: ${j.step ?? 0}. Cost: $${Number(j.cost_usd ?? 0).toFixed(2)}.`,
      `Finished: ${j.finished_at || "unknown"}`,
      `Job id: ${j.id}`,
      ``,
      `The step log and the masked screenshots are in work_steps for this job id.`,
    ].join("\n"),
  };
}
