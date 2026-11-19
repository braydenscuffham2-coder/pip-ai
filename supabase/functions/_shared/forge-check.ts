// The Forge's own check on a build, in code. It answers three questions and writes nothing itself:
//
//   saveBuild(stored, sent, opts, catalog)   may this build be saved? A build that declares jobs (the teammate
//                                            contract, ./teammate-spec.ts) and fails the check is refused with every
//                                            problem in plain words. A build with no jobs is the older shape: it saves
//                                            as before, and the record says it has no declared jobs.
//   canRun(jobs, catalog)                    for each tool a job needs, is anything behind it today? One plain line
//                                            each, so the founder sees honest gaps before go-live.
//   goLive(spec, catalog)                    may this teammate be switched on right now? The contract is checked again
//                                            at that moment, and a job's required tool with nothing behind it says no.
//
// The Forge prepares; Brayden switches on. Nothing here presses go-live, sets a price or sends anything.
// Its one import is the contract beside it, so pip-forge, pip-forge-mcp and the tests all use the same copy.
import { ADD_ONE_RECORDS, checkSpec, CONTRACT, isMoneyTool, type Job, type Level, MONEY_RECORDS } from "./teammate-spec.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const isObj = (v: unknown): v is Record<string, J> => !!v && typeof v === "object" && !Array.isArray(v);

/**
 * What exists today, read from the database by the caller.
 *   steps  connection_catalog: the setup steps an owner sees (Calendar, Email, Booking software, ...).
 *   tools  enabled tool_catalog rows. Only a row that says which kind of record it touches and how (record, level)
 *          counts as reviewed; that is the same test pip-turn uses before it gives a tool to a job.
 */
export type Catalog = {
  steps: { slot: string; label?: string | null; blocks?: string[] | null }[];
  tools: { block: string; record?: string | null; level?: string | null }[];
};
export const NO_CATALOG: Catalog = { steps: [], tools: [] };

/** Reads the two catalogs through the caller's own database reader. Only needed for a spec that declares jobs. */
export async function loadCatalog(rows: (path: string) => Promise<unknown>): Promise<Catalog> {
  const [steps, tools] = await Promise.all([rows("connection_catalog?select=slot,label,blocks"), rows("tool_catalog?enabled=is.true&select=*")]);
  return { steps: Array.isArray(steps) ? steps : [], tools: Array.isArray(tools) ? tools : [] };
}

/** Does this spec declare jobs? The same test the contract uses: either key present means it must pass the check. */
export const declares = (spec: unknown): boolean => isObj(spec) && (spec.contract !== undefined || spec.jobs !== undefined);

/**
 * What is behind one tool of one job.
 *   pip      Pip's own action (alert the owner, save a lead, ...). Always there.
 *   ready    a setup step with a reviewed tool for everything the job asks of it
 *   part     a setup step with reviewed tools, but not for everything the job asks
 *   nothing  a setup step with no reviewed tool at all (booking software, point of sale, accounting, ...)
 *   kit      an extra product the owner connects on their own, named as "kit:<name>"
 *   unknown  a name that is not a setup step, not Pip, and not an extra product
 */
export type Reach = "pip" | "ready" | "part" | "nothing" | "kit" | "unknown";
export type ToolLine = { job: string; tool: string; records: string; required: boolean; reach: Reach; missing: Level[]; say: string };

const VERB: Record<string, string> = { read: "see", add: "add", update: "change" };
const and = (a: string[]) => (a.length < 2 ? a.join("") : `${a.slice(0, -1).join(", ")} and ${a[a.length - 1]}`);
const kinds = (r: string) => `${r.replace(/_/g, " ")}${/(s|payroll)$/.test(r) ? "" : "s"}`;
const doing = (levels: readonly string[], records: string) => `${and(levels.map((l) => (l === "add" && records === "message" ? "send" : l === "add" && records === "call" ? "place" : VERB[l] ?? l)))} ${kinds(records)}`;
const title = (s: string) => s.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * For every tool every job lists: is anything behind it today? Matching a job's tool to a reviewed catalog row follows
 * pip-turn's POST /job exactly: a row belongs to the setup step whose blocks include the row's block, and the job may
 * name that block, the step, or any of the step's blocks.
 *
 * Two things have a reviewed tool and are still closed, so they are reported as gaps:
 *   - money (a money kind of record, or any record in a money tool): refused for everyone until the buying check exists
 *   - for a job that starts on its own (a schedule, an event, the owner): sending a message, placing a call, changing a
 *     record, and reading with a field list. pip-turn's runner does not open those yet (the contract's status table).
 * A test in forge-check.test.ts fails if the runner's own lines for that second rule change, so the two stay in step.
 */
export function canRun(jobs: Job[], catalog: Catalog): ToolLine[] {
  const steps = Array.isArray(catalog?.steps) ? catalog.steps.filter(isObj) : [];
  const reviewed = (Array.isArray(catalog?.tools) ? catalog.tools.filter(isObj) : []).filter((r) => typeof r.block === "string" && typeof r.record === "string" && typeof r.level === "string");
  const stepOfBlock = (block: string) => steps.find((s) => (s.blocks ?? []).includes(block));
  const out: ToolLine[] = [];
  for (const job of jobs) {
    const alone = job.triggers.some((t) => t.type !== "message"), answers = job.triggers.some((t) => t.type === "message");
    for (const g of job.tools) {
      const base = { job: job.id, tool: g.tool, records: g.records, required: g.required };
      const end = (missing: Level[]) => (!missing.length ? "" : g.required ? " This job cannot run without it, so it blocks go-live." : " The job carries on without it.");
      const line = (reach: Reach, missing: Level[], say: string) => out.push({ ...base, reach, missing, say: `${job.name}: ${say}${end(missing)}` });
      if (g.tool === "pip") { line("pip", [], `Pip's own ${g.records.replace(/_/g, " ")}: ready.`); continue; }
      const kit = g.tool.startsWith("kit:"), step = kit ? undefined : steps.find((s) => s.slot === g.tool || (s.blocks ?? []).includes(g.tool));
      const name = kit ? title(g.tool.slice(4)) : step?.label || title(g.tool);
      if ((MONEY_RECORDS as readonly string[]).includes(g.records) || isMoneyTool(g.tool)) {
        line(kit ? "kit" : step ? "nothing" : "unknown", [...g.can], `${name}: Pip cannot ${doing(g.can, g.records)} there yet. Nothing that touches money is open until the buying check exists.`);
        continue;
      }
      if (kit) {
        // An extra product gets pip-turn's add-one rule and nothing else, and only while answering a customer.
        const ok = (l: Level) => l === "add" && answers && (ADD_ONE_RECORDS as readonly string[]).includes(g.records);
        const missing = g.can.filter((l) => !ok(l));
        line("kit", missing, missing.length
          ? `${name}: an extra product the owner connects. Pip cannot ${doing(missing, g.records)} there yet${alone && !answers ? ", and a job that starts on its own cannot use an extra product at all" : ""}.`
          : `${name}: an extra product the owner connects. While answering a customer, Pip can add one new ${g.records.replace(/_/g, " ")} there and nothing else.`);
        continue;
      }
      if (!step) { line("unknown", [...g.can], `"${g.tool}": Pip does not know this tool, so nothing is behind it (the job wants to ${doing(g.can, g.records)}).`); continue; }
      const mine = reviewed.filter((r) => { const s = stepOfBlock(r.block); return !!s && [r.block, s.slot, ...(s.blocks ?? [])].includes(g.tool); });
      if (!mine.length) { line("nothing", [...g.can], `${name}: Pip cannot act there yet (the job wants to ${doing(g.can, g.records)}).`); continue; }
      const none = g.can.filter((l) => !mine.some((r) => r.record === g.records && r.level === l));
      const closed = !alone ? [] : g.can.filter((l) => !none.includes(l) && (["message", "call"].includes(g.records) || l === "update" || (l === "read" && !!g.fields?.read)));
      const missing = g.can.filter((l) => none.includes(l) || closed.includes(l)), can = g.can.filter((l) => !missing.includes(l));
      const why = [none.length ? `Pip cannot ${doing(none, g.records)} there yet.` : "", closed.length ? `A job that starts on its own cannot ${doing(closed, g.records)} there yet.` : ""].filter(Boolean).join(" ");
      if (!missing.length) line("ready", [], `${name}: ready. Pip can ${doing(g.can, g.records)} there once the owner has connected it.`);
      else line("part", missing, `${name}: ${can.length ? `Pip can ${doing(can, g.records)} there. ` : ""}${why}`);
    }
  }
  return out;
}

export type Check = {
  /** false: the older shape, with no declared jobs. */
  declared: boolean;
  /** The contract check passed (always true for the older shape, which has nothing to check). */
  ok: boolean;
  /** Every problem the contract check found, in plain words. */
  errors: string[];
  tools: ToolLine[];
  /** One plain line per tool a job needs: what is behind it today. */
  lines: string[];
  /** The lines that stop go-live: a job's required tool with nothing behind it. */
  blocked: string[];
};
export const OLDER_SHAPE = "No declared jobs. This teammate runs the older way: it answers customers with the tools it was designed with, and nothing on record says what each job may touch.";

/** The whole check on one spec: the contract, then what is behind each tool. */
export function checkBuild(spec: unknown, catalog: Catalog): Check {
  if (!declares(spec)) return { declared: false, ok: true, errors: [], tools: [], lines: [OLDER_SHAPE], blocked: [] };
  const c = checkSpec(spec);
  if (!c.ok) return { declared: true, ok: false, errors: c.errors, tools: [], lines: [], blocked: [] };
  const tools = canRun(c.jobs, catalog);
  return { declared: true, ok: true, errors: [], tools, lines: tools.map((t) => t.say), blocked: tools.filter((t) => t.required && t.missing.length).map((t) => t.say) };
}

/**
 * The spec with the Forge's note on it, under `forge_check`: whether it declares jobs, whether they pass, and what is
 * behind each tool. The Portal and go-live read `declared` to tell an older-shape teammate from one with jobs. The note
 * is a record of what the Forge saw at save time. Go-live never trusts it; it checks again.
 */
export function stamp(spec: unknown, catalog: Catalog, at: string): Record<string, J> {
  const s = isObj(spec) ? spec : {}, c = checkBuild(s, catalog);
  return { ...s, forge_check: c.declared ? { declared: true, contract: CONTRACT, ok: c.ok, ...(c.errors.length ? { errors: c.errors.slice(0, 40) } : {}), lines: c.lines.slice(0, 120), blocks_golive: c.blocked.slice(0, 120), at } : { declared: false, at } };
}

export type Saved = { ok: true; spec: Record<string, J>; check: Check } | { ok: false; errors: string[]; say: string };

/**
 * Decides one save. `stored` is the spec on the record now; `sent` is what this save brings (`contract` and `jobs`,
 * either may be missing); `ready` is true when the save marks the teammate ready for go-live.
 *   - Jobs sent now are put at the top of the spec, beside `board` or `agent`, and checked. If they fail, the save is
 *     refused and nothing is written.
 *   - Jobs already on the record that no longer pass (the contract tightened) refuse a save that marks the teammate
 *     ready. Any other save goes through, and the note on the record says the jobs are failing.
 *   - No jobs at all: saved as before, and the note says so.
 * Gaps (a tool with nothing behind it) never refuse a save. They are returned so the founder sees them.
 */
export function saveBuild(stored: unknown, sent: { contract?: unknown; jobs?: unknown }, opts: { ready: boolean; at: string }, catalog: Catalog): Saved {
  const carried = sent?.contract !== undefined || sent?.jobs !== undefined;
  const spec: Record<string, J> = { ...(isObj(stored) ? stored : {}), ...(sent?.contract !== undefined ? { contract: sent.contract } : {}), ...(sent?.jobs !== undefined ? { jobs: sent.jobs } : {}) };
  const check = checkBuild(spec, catalog);
  if (check.declared && !check.ok && (carried || opts.ready)) {
    const more = check.errors.length > 40 ? [`...and ${check.errors.length - 40} more.`] : [];
    return {
      ok: false, errors: [...check.errors.slice(0, 40), ...more],
      say: carried ? "Not saved. These jobs do not pass the teammate contract. Fix every line below and save again." : "Not saved. The jobs already on this teammate no longer pass the teammate contract, so it cannot be marked ready. Send corrected jobs with this save.",
    };
  }
  return { ok: true, spec: stamp(spec, catalog, opts.at), check };
}

export type Gate = { ok: true; check: Check } | { ok: false; why: string[]; check: Check };

/**
 * May this teammate go live right now? An older-shape teammate goes live as before. One that declares jobs must pass
 * the contract as it stands at this moment, and every job's required tools must have something behind them.
 */
export function goLive(spec: unknown, catalog: Catalog): Gate {
  const check = checkBuild(spec, catalog);
  if (!check.declared) return { ok: true, check };
  if (!check.ok) return { ok: false, check, why: ["Its jobs do not pass the teammate contract as it stands today:", ...check.errors.slice(0, 12), ...(check.errors.length > 12 ? [`...and ${check.errors.length - 12} more.`] : []), "Save corrected jobs from the Forge first."] };
  if (check.blocked.length) return { ok: false, check, why: ["A job needs a tool that has nothing behind it yet:", ...check.blocked.slice(0, 12)] };
  return { ok: true, check };
}

/**
 * What the builder is told about jobs, handed over with every order the Board takes. It points at the contract and its
 * worked examples; the rules themselves live there and in ./teammate-spec.ts, not here.
 */
export const BUILDER_NOTE = {
  contract: CONTRACT,
  rule: "Every thing the owner asked for becomes a job: what starts it, the tools it needs with a level for each (read, add or update; never delete), its limits, and what makes it pause. Anything that is not possible today becomes a plain line for the owner, never a pretend ability.",
  how: "Send contract and jobs to forge_save beside result, for one teammate at a time. A save whose jobs fail the check is refused with every problem in plain words and nothing is saved. The save answers with one line per tool saying what is behind it today; show the gaps to Brayden and write them for the owner. Do not write a permission you could not explain to the owner in one sentence.",
  read: [
    "https://github.com/braydenscuffham2-coder/pip-ai/blob/main/docs/contracts/teammate-spec.md",
    "https://github.com/braydenscuffham2-coder/pip-ai/tree/main/docs/contracts/examples",
  ],
};
