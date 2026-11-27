// Who may use the Setup Agent.
//
// Two doors, and nothing else opens it:
//   1. setup_agent_on is true: every owner may use it. Turning that on for a real customer is Brayden's call.
//   2. The founder test path: a platform admin, on a business that is on the TEST list (act_sandbox_businesses).
//      This lets the Setup Agent be proven live on test accounts while it stays off for every customer.
// A flag that is anything but the boolean true counts as off, and a TEST list that is not a list counts as empty.

export type SetupGate = { flag: unknown; admin: boolean; business: string; sandbox: unknown };

export function setupOpen(g: SetupGate): { open: boolean; why: "on" | "founder_test" | "off" } {
  if (g.flag === true) return { open: true, why: "on" };
  const list = Array.isArray(g.sandbox) ? g.sandbox : [];
  if (g.admin === true && typeof g.business === "string" && g.business.length > 0 && list.includes(g.business)) return { open: true, why: "founder_test" };
  return { open: false, why: "off" };
}
