// What a teammate can and cannot do, in plain words, for the owner's Portal.
//
// Nothing here is written by hand or by a model. Every sentence comes from the teammate's own job list (the contract,
// ./teammate-spec.ts) and from the same check the Forge and the runtime use to decide what is really behind each tool
// today (./forge-check.ts). So the Portal cannot promise something the code would refuse:
//   - "can" lists only what a job is allowed to do AND what has a reviewed tool behind it right now
//   - "notYet" lists what the job was designed to do that Pip cannot do yet, with the reason
//   - "cannot" is what the runtime refuses for this job whatever anyone asks
// A teammate built before the contract gets the one job the runtime gives it ("conversation"), described the same way.
import { type Job, jobsOf, plainWords } from "./teammate-spec.ts";
import { canRun, type Catalog } from "./forge-check.ts";

export type JobCard = {
  id: string; name: string; does: string;
  /** What starts this job. */
  starts: string[];
  /** What it can do today. */
  can: string[];
  /** What it was set up to do that is not possible yet, and why. */
  notYet: string[];
  /** What it cannot do, whatever it is asked. */
  cannot: string[];
  limits: string[];
  pauses: string[];
};
export type Abilities = {
  /** true: the teammate has a declared job list. false: it was built before job lists and runs the one implied job. */
  declared: boolean;
  /** false: the job list is broken, so the teammate does nothing until it is fixed. */
  ok: boolean;
  jobs: JobCard[];
  notes: string[];
};

const TAIL = / This job cannot run without it, so it blocks go-live\.$| The job carries on without it\.$/;

export function abilitiesOf(spec: unknown, manifest: unknown, brain: unknown, catalog: Catalog): Abilities {
  const found = jobsOf(spec, manifest, brain);
  if (!found.jobs.length) {
    return { declared: !found.legacy, ok: false, jobs: [], notes: ["This teammate's job list is not valid, so it does nothing until Pip fixes it."] };
  }
  const lines = canRun(found.jobs, catalog);
  const jobs = found.jobs.map((job): JobCard => {
    const mine = lines.filter((l) => l.job === job.id);
    // Take out every level that has nothing behind it today, so "can" only says what would really go through.
    const tools = job.tools.flatMap((g) => {
      const line = mine.find((l) => l.tool === g.tool && l.records === g.records);
      const can = g.can.filter((level) => !(line?.missing ?? []).includes(level));
      return can.length ? [{ ...g, can }] : [];
    });
    const words = plainWords({ ...job, tools } as Job);
    const notYet = mine.filter((l) => l.missing.length).map((l) => {
      const say = l.say.startsWith(`${job.name}: `) ? l.say.slice(job.name.length + 2) : l.say;
      return say.replace(TAIL, "");
    });
    return { id: job.id, name: job.name, does: job.does, starts: words.starts, can: words.can.filter(Boolean), notYet, cannot: words.cannot, limits: words.limits, pauses: words.pauses };
  });
  return { declared: !found.legacy, ok: true, jobs, notes: found.notes };
}
