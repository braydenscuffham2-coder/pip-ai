// A fixed corpus of 25 candidates that have nothing to do with operators. The Brain's gate, scorer and selection must give
// exactly the same answer on them before and after the operator patch (tests/brain/golden.json was recorded from the
// unpatched bundle). Kept plain data so it can be read by anyone.
const C = (id, name, uses, claims = [["Customers ask after hours", "seen"]], extra = {}) => ({
  id, name, uses, lens: "t", power: extra.power ?? "answers", moment: extra.moment ?? "m1", why_personal: extra.why ?? "They said so on the site.",
  claims: claims.map(([text, status]) => ({ text, status, evidence: [] })),
});
export const MATERIAL = "Fork Plumbing opens at 7 and closes at 6. Call 208 555 0100. We serve Meridian and Boise, since 1998, and answer after hours.";
export const MOMENTS = new Map([["m1", { id: "m1", severity: 2 }], ["m2", { id: "m2", severity: 1 }], ["m3", { id: "m3", severity: 3 }]]);
export const CORPUS = [
  C("c01", "After-hours chat", ["web_chat", "knowledge", "handoff"]),
  C("c02", "Text reminders", ["sms", "schedule", "calendar"], [["Missed appointments cost jobs", "seen"], ["We open at 7", "seen"]], { moment: "m2", power: "reminds" }),
  C("c03", "Email follow-up", ["email", "crm", "record_change"], [["Quotes go quiet", "inferred"]], { moment: "m3", power: "follows_up" }),
  C("c04", "Phone answerer", ["voice", "calendar", "handoff"], [["Calls go to voicemail", "seen"]]),
  C("c05", "Natural voice", ["realtime_voice", "booking_app"], [["Calls go to voicemail", "seen"], ["We answer after hours", "seen"]], { power: "answers" }),
  C("c06", "Unknown id", ["web_chat", "teleporter"]),
  C("c07", "Nothing usable", ["teleporter"]),
  C("c08", "Empty uses", []),
  C("c09", "Sink with no source", ["live_board", "weekly_report"]),
  C("c10", "Reason with no input", ["anomaly_alert", "owner_alerts"]),
  C("c11", "Camera counter", ["edge_box", "nvr_pull", "vision_zones", "data_sink"], [["Waits run long at lunch", "seen"]], { power: "watches" }),
  C("c12", "Health intake", ["health_records", "forms", "web_chat"]),
  C("c13", "Number not in material", ["web_chat", "knowledge"], [["We save customers 47 minutes a day", "inferred"]]),
  C("c14", "Never-design hit", ["send_text", "capture_lead"], [["Texts everyone who ever called", "inferred"]]),
  C("c15", "Create job", ["create_job", "field_service", "capture_lead"], [["Jobs get typed twice", "seen"]], { moment: "m2", power: "records" }),
  C("c16", "Photo quote", ["photos", "documents", "knowledge"], [["Customers send photos", "seen"]], { moment: "m3", power: "quotes" }),
  C("c17", "Review replies", ["google_profile", "draft_for_approval", "owner_alerts"], [["Reviews wait days for a reply", "seen"]], { power: "replies" }),
  C("c18", "Social posts", ["social_posting", "knowledge", "draft_for_approval"], [["Their page is quiet", "inferred"]], { power: "posts" }),
  C("c19", "Monday report", ["weekly_report", "crm", "accounting"], [["Owner asks for numbers on Monday", "inferred"]], { power: "reports" }),
  C("c20", "Rival watch", ["rival_watch", "schedule", "owner_alerts"], [["A competitor opened nearby", "seen"]], { power: "watches" }),
  C("c21", "Demand forecast", ["demand_forecast", "pos", "weekly_report"], [["Busy Fridays", "seen"]], { power: "forecasts" }),
  C("c22", "Missing component", ["shift_optimizer", "weekly_report"], [["Schedules take hours", "seen"]], { power: "forecasts" }),
  C("c23", "Translation chat", ["web_chat", "translation", "knowledge"], [["Spanish-speaking customers call", "seen"]]),
  C("c24", "No evidence", ["web_chat", "knowledge"], [["Maybe they want chat", "unknown"]]),
  C("c25", "Everything outbound", ["sms", "email", "social_dm", "whatsapp", "crm"], [["Customers like texts", "seen"], ["Email works too", "inferred"]], { power: "follows_up" }),
];
// Which candidates the model-based NEVER DESIGN check flags, standing in for the haiku call.
export const NEVER = { c14: "Texting, calling or emailing people who never opted in" };
export const CTXS = [
  { industry: "plumbing", state: "ID" }, { industry: "health", state: "TX" }, { industry: "restaurant", state: "IL" },
];
