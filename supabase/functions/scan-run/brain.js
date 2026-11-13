// src/primitives.ts
var d = (e) => e, B = [
  d({ id: "web_chat", kind: "channel", label: "Website chat", how: "Our widget, one line on their site", limits: "Must say it is AI when asked.", runtime: "shared", tier: "ready", effort: 1, cost_band: "low", risk: ["ai_disclosure"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "widget" }], inputs: ["message"], outputs: ["message", "event"], test_strategy: "conversation_sim", setup: "Paste one line onto the website", legacy_tier: 1 }),
  d({ id: "sms", kind: "channel", label: "Text messages", how: "Twilio number", limits: "Only people who opted in or texted first. US needs A2P 10DLC carrier registration (2-4 weeks). Honor STOP.", runtime: "shared", tier: "build", effort: 3, cost_band: "low", risk: ["tcpa", "10dlc", "ai_disclosure"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "twilio", role: "sms" }, { name: "telnyx", role: "sms" }], inputs: ["message"], outputs: ["message", "event"], test_strategy: "conversation_sim", outbound: !0, requires: ["consent_ledger"], setup: "Texting number and US carrier registration", legacy_tier: 2 }),
  d({ id: "voice", kind: "channel", label: "Phone calls", how: "Voice AI (Vapi, Retell or Twilio Voice) on a forwarded number", limits: "Discloses it is AI. Call recording needs consent in two-party-consent states. Can transfer to a person.", runtime: "shared", tier: "build", effort: 2, cost_band: "mid", risk: ["ai_disclosure", "two_party_consent", "tcpa"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "twilio-conversationrelay", role: "telephony+speech" }, { name: "vapi", role: "voice-agent" }, { name: "retell", role: "voice-agent" }], inputs: ["message"], outputs: ["message", "event", "media"], test_strategy: "conversation_sim", requires: ["ai_disclosure"], setup: "Forward missed calls to a new number", legacy_tier: 3 }),
  d({ id: "email", kind: "channel", label: "Email", how: "Resend or Postmark from their domain", limits: "Verified domain (SPF/DKIM). Unsubscribe link on marketing email. No cold lists.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: ["ai_disclosure"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "resend", role: "email" }, { name: "postmark", role: "email" }], inputs: ["message"], outputs: ["message", "event"], test_strategy: "conversation_sim", outbound: !0, requires: ["consent_ledger"], setup: "Verify the sending domain", legacy_tier: 2 }),
  d({ id: "social_dm", kind: "channel", label: "Facebook and Instagram messages", how: "Meta Messenger and Instagram APIs", limits: "Replies only within 24 hours of the customer's last message, unless it is a tagged update.", runtime: "shared", tier: "build", effort: 3, cost_band: "low", risk: ["ai_disclosure"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "meta", role: "messaging" }], inputs: ["message"], outputs: ["message", "event"], test_strategy: "conversation_sim", outbound: !0, requires: ["consent_ledger"] }),
  d({ id: "whatsapp", kind: "channel", label: "WhatsApp", how: "WhatsApp Business API", limits: "Templates approved by Meta for messages outside a 24-hour window.", runtime: "shared", tier: "build", effort: 3, cost_band: "low", risk: ["ai_disclosure"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "meta", role: "messaging" }], inputs: ["message"], outputs: ["message", "event"], test_strategy: "conversation_sim", outbound: !0, requires: ["consent_ledger"] }),
  d({ id: "knowledge", kind: "knowledge", label: "Business brain", how: "Their site, reviews, services and owner answers", limits: "Answers only from what the business confirmed.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "knowledge" }], inputs: ["document"], outputs: ["document"], test_strategy: "unit" }),
  d({ id: "photos", kind: "sense", label: "Reads photos customers send", how: "Vision model on uploaded photos", limits: "Can describe and sort, never diagnose medically or guarantee a price from a photo.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "anthropic", role: "vision" }], inputs: ["media"], outputs: ["record"], test_strategy: "fixture_replay" }),
  d({ id: "documents", kind: "act", label: "Writes documents", how: "Model drafts quotes, letters, forms, reports as PDF or doc", limits: "Drafts only; a person approves anything binding.", runtime: "shared", tier: "ready", effort: 1, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "anthropic", role: "drafting" }], inputs: ["record"], outputs: ["document"], test_strategy: "unit" }),
  d({ id: "translation", kind: "act", label: "Other languages", how: "Model answers in the customer's language", limits: "No certified or legal translation.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "anthropic", role: "language" }], inputs: ["message"], outputs: ["message"], test_strategy: "conversation_sim" }),
  d({ id: "transcripts", kind: "sense", label: "Call and voicemail notes", how: "Transcribe recordings and summarize", limits: "Only recordings made with consent.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: ["two_party_consent"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "deepgram", role: "stt" }, { name: "gemini", role: "audio" }], inputs: ["media"], outputs: ["document", "record"], test_strategy: "fixture_replay" }),
  d({ id: "calendar", kind: "connection", label: "Calendar", how: "Google Calendar or Outlook API", limits: "Owner grants access. Respects their rules for buffers and hours.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "google", role: "calendar" }, { name: "microsoft", role: "calendar" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit", setup: "Sign in to Google Calendar or Outlook", legacy_tier: 2 }),
  d({ id: "booking_app", kind: "connection", label: "Booking software", how: "Calendly, Acuity, Square Appointments, Mindbody, Vagaro, Boulevard, OpenTable or Resy where an API or integration exists", limits: "Only apps with an API or Zapier/Make integration.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "various", role: "booking" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit" }),
  d({ id: "field_service", kind: "connection", label: "Job software", how: "Housecall Pro, Jobber, ServiceTitan APIs", limits: "ServiceTitan API needs their approval as a partner app.", runtime: "shared", tier: "needs_setup", effort: 3, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "jobber", role: "fsm" }, { name: "housecallpro", role: "fsm" }, { name: "servicetitan", role: "fsm" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit", setup: "Connect Housecall Pro, Jobber, ServiceTitan or Square", legacy_tier: 2 }),
  d({ id: "crm", kind: "connection", label: "CRM", how: "HubSpot, GoHighLevel, Salesforce, Follow Up Boss", limits: "Owner grants access.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "hubspot", role: "crm" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit" }),
  d({ id: "pos", kind: "connection", label: "Point of sale", how: "Square, Toast, Clover APIs", limits: "Read orders and customers; no refunds or charges by AI.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: ["pci"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "square", role: "pos" }, { name: "toast", role: "pos" }, { name: "clover", role: "pos" }], inputs: [], outputs: ["record", "timeseries", "event"], test_strategy: "unit" }),
  d({ id: "ecommerce", kind: "connection", label: "Online store", how: "Shopify, WooCommerce", limits: "Order status and product questions; no refunds without a person.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "shopify", role: "store" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit" }),
  d({ id: "accounting", kind: "connection", label: "Accounting", how: "QuickBooks or Xero API", limits: "Read invoices and send reminders; never moves money.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "quickbooks", role: "accounting" }, { name: "xero", role: "accounting" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit" }),
  d({ id: "esign", kind: "connection", label: "E-signatures", how: "DocuSign or Dropbox Sign", limits: "Sends documents a person approved.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "docusign", role: "esign" }], inputs: ["document"], outputs: ["event"], test_strategy: "unit" }),
  d({ id: "payment_links", kind: "connection", label: "Payment links", how: "Stripe or Square payment links", limits: "Sends a link to a secure page. Never takes card numbers in chat.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: ["pci"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "stripe", role: "payments" }], inputs: ["record"], outputs: ["message", "event"], test_strategy: "unit" }),
  d({ id: "sheets", kind: "connection", label: "Spreadsheets", how: "Google Sheets or Excel", limits: "Owner shares the sheet.", runtime: "shared", tier: "needs_setup", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "google", role: "sheets" }], inputs: ["record"], outputs: ["record"], test_strategy: "unit", setup: "Share a sheet", legacy_tier: 2 }),
  d({ id: "forms", kind: "channel", label: "Forms and intake", how: "Their form tool or ours", limits: "No SSNs, card numbers or IDs.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "forms" }], inputs: [], outputs: ["record", "event"], test_strategy: "unit" }),
  d({ id: "google_profile", kind: "connection", label: "Google Business Profile", how: "Business Profile API: read reviews, reply, post updates", limits: "Owner access. Reviews can't be removed or bought; asking only happy customers (gating) breaks Google rules.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: ["google_tos"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "google", role: "gbp" }], inputs: ["message"], outputs: ["record", "event"], test_strategy: "unit", setup: "Sign in to Google Business Profile", legacy_tier: 2 }),
  d({ id: "social_posting", kind: "act", label: "Social posts", how: "Meta and Google posting APIs", limits: "Owner approves posts.", runtime: "shared", tier: "build", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "meta", role: "posting" }], inputs: ["document"], outputs: ["event"], test_strategy: "unit" }),
  d({ id: "web_monitor", kind: "sense", label: "Watches public pages", how: "Scheduled checks of public websites and listings", limits: "Public information only; respects site terms. No logins to other people's accounts.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "crawler" }], inputs: [], outputs: ["record", "event"], test_strategy: "fixture_replay" }),
  d({ id: "weather", kind: "trigger", label: "Weather and dates", how: "Weather API and calendars of holidays and seasons", limits: "Forecasts, not guarantees.", runtime: "shared", tier: "build", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "openweather", role: "weather" }], inputs: [], outputs: ["event", "timeseries"], test_strategy: "unit" }),
  d({ id: "maps", kind: "reason", label: "Maps and distance", how: "Google Maps APIs", limits: "Estimates drive time; never promises arrival times.", runtime: "shared", tier: "build", effort: 1, cost_band: "low", risk: ["google_tos"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "google", role: "maps" }], inputs: ["record"], outputs: ["record"], test_strategy: "unit" }),
  d({ id: "schedule", kind: "trigger", label: "Runs on a schedule", how: "Cron jobs on our server", limits: "None.", runtime: "shared", tier: "build", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "cron" }], inputs: [], outputs: ["event"], test_strategy: "unit", legacy_tier: 2 }),
  d({ id: "owner_alerts", kind: "act", label: "Alerts the owner", how: "Email, text or Slack through our relay", limits: "None.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "relay" }], inputs: ["event", "record"], outputs: ["message"], test_strategy: "unit" }),
  d({ id: "owner_approval", kind: "guard", label: "Exceptions to the owner", how: "Only the cases in its exceptions wait for one tap; everything else runs on its own", limits: "Only for the listed exceptions, never for every action.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "approval" }], inputs: ["event"], outputs: ["event"], test_strategy: "unit" }),
  d({ id: "team_chat", kind: "connection", label: "Team chat", how: "Slack, Microsoft Teams or group text", limits: "Workspace access.", runtime: "shared", tier: "needs_setup", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "slack", role: "chat" }], inputs: ["message"], outputs: ["message"], test_strategy: "unit" }),
  d({ id: "health_records", kind: "connection", label: "Health record systems", how: "Only through a HIPAA-compliant vendor with a signed BAA", limits: "Protected health info never goes to tools without a BAA. Usually skip and use scheduling only.", runtime: "shared", tier: "build", effort: 3, cost_band: "high", risk: ["hipaa_baa"], needs_hardware: !1, needs_baa: !0, needs_owner_oauth: !0, providers: [{ name: "opendental", role: "pms" }], inputs: ["record"], outputs: ["record"], test_strategy: "unit", industries: ["health"] })
], be = [
  d({ id: "inbound_message", kind: "trigger", label: "A customer writes in", how: "Any connected channel", limits: "None.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "runtime" }], inputs: ["message"], outputs: ["event"], test_strategy: "conversation_sim", legacy_tier: 1 }),
  d({ id: "record_change", kind: "trigger", label: "Something changes in their software", how: "Webhooks from a connected booking or job tool", limits: "None.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "various", role: "webhook" }], inputs: ["record"], outputs: ["event"], test_strategy: "unit", setup: "Connect their booking or job software", legacy_tier: 2 }),
  d({ id: "outside_signal", kind: "trigger", label: "Weather, dates or local events", how: "Weather API and calendars", limits: "Forecasts, not guarantees.", runtime: "shared", tier: "build", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "openweather", role: "weather" }], inputs: [], outputs: ["event"], test_strategy: "unit", legacy_tier: 2 }),
  d({ id: "capture_lead", kind: "act", label: "Save a lead", how: "Writes the lead to the shared sheet or CRM", limits: "No SSNs, card numbers or IDs.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "runtime" }], inputs: ["message"], outputs: ["record"], test_strategy: "conversation_sim", legacy_tier: 1 }),
  d({ id: "request_booking", kind: "act", label: "Ask for a time (owner confirms)", how: "Collects preferred times and files the request", limits: "Books on its own only once a calendar or booking app is connected.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "runtime" }], inputs: ["message"], outputs: ["record", "event"], test_strategy: "conversation_sim", legacy_tier: 1 }),
  d({ id: "notify_owner", kind: "act", label: "Alert the owner", how: "One relay to the owner's email or phone", limits: "None.", runtime: "shared", tier: "needs_setup", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "relay" }], inputs: ["event"], outputs: ["message"], test_strategy: "unit", setup: "Point OWNER_ALERT_WEBHOOK at the owner's email or phone (one relay, set once)", legacy_tier: 1 }),
  d({ id: "handoff", kind: "act", label: "Hand the conversation to a person", how: "Transfers with a summary", limits: "None.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "runtime" }], inputs: ["message"], outputs: ["event"], test_strategy: "conversation_sim", legacy_tier: 1 }),
  d({ id: "draft_for_approval", kind: "act", label: "Draft for the owner to approve", how: "Drafts and waits for one tap", limits: "Only for the listed exceptions (prices, refunds, contracts, money), never for every action.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "runtime" }], inputs: ["record"], outputs: ["document", "event"], test_strategy: "unit", legacy_tier: 1 }),
  d({ id: "create_job", kind: "act", label: "Create a job in their software", how: "Writes to the connected job tool", limits: "Only with a connected job tool.", runtime: "shared", tier: "needs_setup", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "jobber", role: "fsm" }], inputs: ["record"], outputs: ["record", "event"], test_strategy: "unit", requires: ["field_service"], setup: "Connect their job software", legacy_tier: 2 }),
  d({ id: "send_text", kind: "act", label: "Send a text", how: "Twilio number", limits: "Only people who opted in or texted first. Honor STOP.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: ["tcpa", "10dlc"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "twilio", role: "sms" }], inputs: ["record"], outputs: ["message"], test_strategy: "unit", outbound: !0, requires: ["consent_ledger"], setup: "Texting number", legacy_tier: 2 }),
  d({ id: "brain", kind: "knowledge", label: "Business brain", how: "Supabase plus the scan", limits: "Answers only from what the business confirmed.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "knowledge" }], inputs: ["document"], outputs: ["document"], test_strategy: "unit", legacy_tier: 1 })
], _e = [
  // --- on-prem compute and sensing (the camera lane) ---
  d({ id: "edge_box", kind: "compute", label: "On-site box", how: "A small pre-flashed computer Pip ships (Jetson-class or a GPU mini-PC); it runs detection locally and sends only counts and timestamps to the cloud", limits: "Video never leaves the building and is never stored. Needs power, network and a 24-hour soak before it goes live.", runtime: "onprem", tier: "hardware", effort: 4, cost_band: "mid", risk: ["camera_privacy"], needs_hardware: !0, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "nvidia-jetson", role: "edge" }], inputs: ["media"], outputs: ["event", "timeseries"], test_strategy: "video_replay" }),
  d({ id: "nvr_pull", kind: "sense", label: "Existing cameras", how: "Reads RTSP streams from the restaurant's own NVR or cameras", limits: "Read-only camera credentials from the owner. Only cameras the owner names.", runtime: "onprem", tier: "hardware", effort: 3, cost_band: "none", risk: ["camera_privacy"], needs_hardware: !0, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "rtsp", role: "ingest" }], inputs: [], outputs: ["media"], test_strategy: "video_replay", requires: ["edge_box"] }),
  d({ id: "vision_zones", kind: "sense", label: "Table and zone occupancy", how: "A detector and tracker on the on-site box watches zones the installer draws (tables, bar, waiting area) and emits seated and open events", limits: "Counts people only. No faces, no identities, no biometrics, nothing stored. Signage at the entrance is required; some states (Illinois, Texas, Washington) have biometric laws to check.", runtime: "onprem", tier: "hardware", effort: 4, cost_band: "mid", risk: ["camera_privacy", "biometric_state_law"], needs_hardware: !0, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "rf-detr", role: "detector (Apache-2.0)" }, { name: "bytetrack", role: "tracker" }], inputs: ["media"], outputs: ["event", "timeseries"], test_strategy: "video_replay", requires: ["edge_box"] }),
  d({ id: "vision_count", kind: "sense", label: "People in and out", how: "Counts people crossing a line the installer draws (door, counter)", limits: "Counts only. No faces, no identities. Signage required.", runtime: "onprem", tier: "hardware", effort: 4, cost_band: "mid", risk: ["camera_privacy", "biometric_state_law"], needs_hardware: !0, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "rf-detr", role: "detector (Apache-2.0)" }], inputs: ["media"], outputs: ["event", "timeseries"], test_strategy: "video_replay", requires: ["edge_box"] }),
  d({ id: "vision_queue", kind: "sense", label: "Line length", how: "Counts people waiting in a zone and how long they wait", limits: "Counts only. No faces, no identities. Signage required.", runtime: "onprem", tier: "hardware", effort: 4, cost_band: "mid", risk: ["camera_privacy", "biometric_state_law"], needs_hardware: !0, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "rf-detr", role: "detector (Apache-2.0)" }], inputs: ["media"], outputs: ["event", "timeseries"], test_strategy: "video_replay", requires: ["edge_box"] }),
  // --- reasoning ---
  d({ id: "dwell_model", kind: "reason", label: "Time until a table leaves", how: "Estimates remaining time at each table from how long they have been seated, party size and time of day, learned from this restaurant's own history", limits: "An estimate, never a promise. Starts rough and improves weekly.", runtime: "custom", tier: "build", effort: 3, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "model" }], inputs: ["event", "timeseries"], outputs: ["timeseries", "record"], test_strategy: "fixture_replay", requires: ["vision_zones"] }),
  d({ id: "demand_forecast", kind: "reason", label: "Demand forecast", how: "A statistical model (CatBoost) on their sales, bookings, weather and calendar predicts covers, calls or jobs by hour or day", limits: "Shown with its error range. Never invents numbers; needs at least a few months of history.", runtime: "custom", tier: "build", effort: 3, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "catboost", role: "forecast" }], inputs: ["timeseries", "record"], outputs: ["timeseries"], test_strategy: "backtest" }),
  d({ id: "shift_optimizer", kind: "reason", label: "Shift planner", how: "An optimizer (OR-Tools) turns the forecast and the owner's rules into a staffing plan", limits: "The owner approves every schedule before anyone sees it. Never sets wages or hires.", runtime: "custom", tier: "build", effort: 3, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "or-tools", role: "optimizer" }], inputs: ["timeseries", "record"], outputs: ["document", "record"], test_strategy: "unit", requires: ["demand_forecast", "owner_approval"] }),
  d({ id: "anomaly_alert", kind: "reason", label: "Spots the unusual", how: "Watches a number over time and alerts when it breaks its usual pattern", limits: "Alerts, never acts on its own.", runtime: "custom", tier: "build", effort: 2, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "model" }], inputs: ["timeseries"], outputs: ["event"], test_strategy: "fixture_replay" }),
  d({ id: "embed_search", kind: "reason", label: "Searches their documents", how: "Indexes the documents the owner shares so answers cite the right page", limits: "Only documents the owner shared. No private customer records.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pgvector", role: "index" }], inputs: ["document"], outputs: ["document"], test_strategy: "unit" }),
  // --- sensing beyond the camera ---
  d({ id: "video_digest", kind: "sense", label: "Reads recorded video and audio", how: "A multimodal model (Gemini) summarizes clips and recordings the owner uploads", limits: "Recorded clips only, never a live feed. Nothing about identifiable people.", runtime: "custom", tier: "build", effort: 2, cost_band: "low", risk: ["camera_privacy"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "gemini", role: "video" }], inputs: ["media"], outputs: ["document"], test_strategy: "fixture_replay" }),
  d({ id: "document_ocr", kind: "sense", label: "Reads paper and PDFs", how: "Reads menus, invoices, intake forms and photos of paperwork into structured fields", limits: "No SSNs, card numbers or IDs are kept.", runtime: "custom", tier: "build", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "anthropic", role: "vision" }], inputs: ["media", "document"], outputs: ["record"], test_strategy: "fixture_replay" }),
  d({ id: "rival_watch", kind: "sense", label: "Watches named competitors", how: "On a schedule, re-reads each rival's public footprint (site, listing, review replies, ads, job posts, social) and reports what changed", limits: "Public information only. Never logs in, never contacts them, never scrapes private data.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: ["google_tos"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "footprint" }], inputs: [], outputs: ["record", "event", "document"], test_strategy: "fixture_replay", requires: ["schedule"] }),
  // --- sinks ---
  d({ id: "data_sink", kind: "sink", label: "Writes rows", how: "Appends typed rows to a Google Sheet, a table or a CSV the owner owns, with a live tab and a history tab", limits: "The owner shares the destination. Columns are fixed in the data contract.", runtime: "shared", tier: "needs_setup", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !0, providers: [{ name: "google", role: "sheets" }, { name: "supabase", role: "table" }], inputs: ["record", "event", "timeseries"], outputs: ["record"], test_strategy: "unit" }),
  d({ id: "live_board", kind: "sink", label: "Live status page", how: "A hosted page for the floor, the phone or the day that updates as events arrive", limits: "Shows counts and times only, never people.", runtime: "shared", tier: "build", effort: 2, cost_band: "low", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "vercel", role: "hosting" }], inputs: ["event", "timeseries", "record"], outputs: [], test_strategy: "unit" }),
  d({ id: "weekly_report", kind: "sink", label: "Monday report", how: "One plain email or text each week with the lines every teammate measures", limits: "Numbers only from what the teammates counted.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "report" }], inputs: ["record", "timeseries"], outputs: ["document", "message"], test_strategy: "unit" }),
  // --- channel ---
  d({ id: "realtime_voice", kind: "channel", label: "Natural phone conversation", how: "A speech-to-speech model on a forwarded number (Twilio ConversationRelay with the house voices; OpenAI Realtime or ElevenLabs Agents behind the same adapter)", limits: "Says it is AI at the start of every call. Recording needs consent in two-party-consent states. Transfers to a person on request.", runtime: "shared", tier: "build", effort: 3, cost_band: "high", risk: ["ai_disclosure", "two_party_consent", "tcpa"], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "twilio-conversationrelay", role: "telephony+speech" }, { name: "elevenlabs", role: "voices" }, { name: "openai-realtime", role: "speech-to-speech" }], inputs: ["message"], outputs: ["message", "event", "media"], test_strategy: "conversation_sim", requires: ["ai_disclosure"] }),
  // --- guards ---
  d({ id: "consent_ledger", kind: "guard", label: "Opt-in ledger", how: "Records who agreed to texts, emails and calls, honors STOP, and blocks any message to someone who never opted in", limits: "Every outbound message checks it first. Never bypassed.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "guard" }], inputs: ["record"], outputs: ["event"], test_strategy: "unit" }),
  d({ id: "ai_disclosure", kind: "guard", label: "Says it is AI", how: "Adds the right disclosure wording for the state and channel to every first message and call", limits: "Never removed.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "guard" }], inputs: ["message"], outputs: ["message"], test_strategy: "unit" }),
  d({ id: "pii_scrub", kind: "guard", label: "Keeps secrets out", how: "Strips card numbers, SSNs and IDs from anything a teammate stores or sends", limits: "Never removed.", runtime: "shared", tier: "ready", effort: 1, cost_band: "none", risk: [], needs_hardware: !1, needs_baa: !1, needs_owner_oauth: !1, providers: [{ name: "pip", role: "guard" }], inputs: ["message", "record"], outputs: ["message", "record"], test_strategy: "unit" })
], E = [...B, ...be, ..._e], Fe = E.map((e) => e.id), ve = new Map(E.map((e) => [e.id, e])), k = (e) => ve.get(e), We = B.map((e) => e.id);
var q = E.filter((e) => e.outbound).map((e) => e.id), P = E.filter((e) => e.kind === "sink").map((e) => e.id);
function U(e) {
  return E.filter(e ?? (() => !0)).map((t) => `- ${t.id}: ${t.label} (${t.how}). Rules: ${t.limits}${t.needs_hardware ? " Needs hardware on site." : ""}`).join(`
`);
}
var R = [
  "Medical, legal, tax or investment advice or diagnosis; it can explain the business's own services and book a professional",
  "Taking card numbers, bank details, SSNs or IDs in a conversation",
  "Fake reviews, buying reviews, rewards for reviews, or only asking happy customers",
  "Texting, calling or emailing people who never opted in",
  "Pretending to be a human, or cloning a real person's voice without consent",
  "Final prices, discounts, contracts, refunds or moving money without a person",
  "Asking about protected traits when hiring",
  "Reading competitors' private data, logging in to accounts that are not theirs, or guaranteeing search rankings",
  "Anything a real tool, API or law does not allow today",
  // Added for the new reach:
  "Identifying, recognizing or tracking a specific person on camera, or storing video"
], O = [
  "an after-hours desk that books the job itself and pages the on-call person only for emergencies",
  "a photo-based quote helper that sorts what the customer sent and asks the missing questions",
  "a review responder that replies to every review in the owner's voice and hands the owner only 1-3 star ones",
  "a quote follow-up that answers the customer's actual objection",
  "a seasonal reminder that reaches past customers before the weather turns",
  "a team assistant that writes estimates, letters and policies from the business brain"
];

// src/gate.ts
var G = ["ready", "needs_setup", "build", "hardware"], ke = (e, t) => G.indexOf(e) >= G.indexOf(t) ? e : t, Se = /* @__PURE__ */ new Set(["IL", "TX", "WA"]);
function xe(e, t) {
  return (e.match(/\d+(?:[.,]\d+)?/g) || []).every((r) => t.includes(r) || Number(r.replace(",", "")) <= 12);
}
function Ie(e) {
  return e.some((t) => t.runtime === "onprem") ? "onprem" : e.some((t) => t.runtime === "custom") ? "code" : "spec";
}
async function $(e, t) {
  let s = [], r = /* @__PURE__ */ new Set(), n = Array.from(new Set(e.uses.filter((a) => typeof a == "string"))), o = n.filter((a) => !k(a));
  if (o.length && s.push(`unknown primitive ids: ${o.join(", ")}`), n = n.filter((a) => k(a)), !n.length)
    return {
      candidateId: e.id,
      status: "drop",
      errors: [...s, "no usable primitives"],
      risk: [],
      needs: [],
      lane: "spec",
      tier: "ready",
      effort: 1
    };
  let c = !1, w = (a) => {
    n.includes(a) || (n.push(a), c = !0);
  };
  for (let a of n.slice()) {
    let l = k(a);
    for (let b of l.requires ?? []) {
      let v = k(b);
      v && v.kind === "guard" && w(b);
    }
  }
  n.some((a) => q.includes(a)) && w("consent_ledger"), n.some((a) => ["voice", "realtime_voice", "web_chat", "sms", "email", "social_dm", "whatsapp"].includes(a)) && w("ai_disclosure");
  let g = n.map((a) => k(a));
  for (let a of g)
    for (let l of a.requires ?? []) {
      let b = k(l);
      b && b.kind !== "guard" && !n.includes(l) && s.push(`${a.id} needs ${l} in the same skill`);
    }
  let m = g.filter((a) => P.includes(a.id));
  m.length && (g.filter((l) => !P.includes(l.id) && l.outputs.some((b) => b === "event" || b === "record" || b === "timeseries")).length || s.push(`a sink (${m.map((l) => l.id).join(", ")}) needs something that produces rows or events`));
  for (let a of g.filter((l) => l.kind === "reason" && l.inputs.length))
    g.filter((b) => b.id !== a.id && b.outputs.some((v) => a.inputs.includes(v))).length || s.push(`${a.id} needs an input (${a.inputs.join(" or ")}) from another primitive`);
  let u = /* @__PURE__ */ new Set();
  for (let a of g) a.risk.forEach((l) => u.add(l));
  u.has("camera_privacy") && r.add("signage at every entrance"), u.has("biometric_state_law") && t.state && Se.has(t.state.toUpperCase()) && r.add(`biometric-law review for ${t.state.toUpperCase()}`), u.has("10dlc") && r.add("A2P 10DLC registration (2-4 weeks)"), u.has("two_party_consent") && r.add("call-recording consent wording"), u.has("google_tos") && r.add("Google terms: live fetch, attribution");
  for (let a of g)
    a.needs_owner_oauth && r.add(`owner connects ${a.label}`), a.needs_hardware && r.add("on-site box and installer visit");
  g.some((a) => a.needs_baa) && (u.add("hipaa_baa"), t.industry === "health" ? r.add("signed BAA with every vendor on the path, or scope to scheduling only") : s.push("health_records outside a health business makes no sense")), t.industry === "health" && g.some((a) => a.kind === "channel") && r.add("never confirm anyone is a patient; no clinical details on any channel");
  let h = Ie(g), i = g.map((a) => a.tier).reduce(ke, "ready"), p = Math.max(...g.map((a) => a.effort));
  for (let a of e.claims) {
    xe(a.text, t.material) || s.push(`claim has a number not in the material: "${a.text.slice(0, 80)}"`);
    for (let l of a.evidence)
      l.quote && !t.material.toLowerCase().includes(l.quote.toLowerCase().slice(0, 40)) && s.push(`evidence quote not found in material: "${l.quote.slice(0, 60)}"`);
  }
  if (t.neverDesign) {
    let a = await t.neverDesign([e.name, ...e.claims.map((l) => l.text), e.why_personal]);
    a && s.push(`NEVER DESIGN: ${a}`);
  }
  let _ = s.some((a) => a.startsWith("NEVER DESIGN") || a.startsWith("no usable") || a.includes("makes no sense")) ? "drop" : s.length ? "repair" : "pass";
  return {
    candidateId: e.id,
    status: _,
    errors: s,
    risk: Array.from(u),
    needs: Array.from(r),
    lane: h,
    tier: i,
    effort: p,
    repaired_uses: c ? n : void 0
  };
}

// src/score.ts
var Ee = { seen: 1, inferred: 0.5, unknown: 0 }, Te = { ready: 1, needs_setup: 0.9, build: 0.7, hardware: 0.5 };
function H(e, t, s) {
  let n = s.get(e.moment)?.severity ?? 1, o = e.claims.map((i) => Ee[i.status] ?? 0), c = o.reduce((i, p) => i + p, 0) * n, w = o.length ? o.reduce((i, p) => i + p, 0) / o.length : 0, m = (t.repaired_uses ?? e.uses).map((i) => k(i)).filter(Boolean).reduce((i, p) => i * Te[p.tier], 1), u = Math.max(1, t.effort), f = t.status === "drop" ? 0 : 1, h = f * (c * w * m) / u;
  return { impact: c, confidence: w, feasibility: m, effort: u, risk_gate: f, score: Number(h.toFixed(4)) };
}
function F(e, t) {
  if (e.risk_gate === 0) return 60;
  let s = t > 0 ? e.impact / t : 0, r = 60 + 38 * (0.6 * e.confidence + 0.4 * s);
  return Math.max(60, Math.min(98, Math.round(r)));
}

// src/diversity.ts
var W = (e, t) => (t ?? e.uses).slice().sort().join("+");
function Ae(e, t) {
  let s = new Set(e), r = new Set(t), n = [...s].filter((c) => r.has(c)).length, o = (/* @__PURE__ */ new Set([...s, ...r])).size;
  return o ? n / o : 0;
}
function J(e, t) {
  let s = t.keep ?? 6, r = t.maxPerPower ?? 2, n = t.overlapPenalty ?? 0.5, o = t.commonThreshold ?? 0.3, c = t.commonPenalty ?? 0.6, w = t.strongConfidence ?? 0.9, g = [], m = [];
  for (let l of e) {
    if (l.gate.status === "drop") {
      g.push({ candidate: l.candidate, reason: `gate: ${l.gate.errors.join("; ")}` });
      continue;
    }
    if (l.score.score <= 0) {
      g.push({ candidate: l.candidate, reason: "no seen or inferred evidence" });
      continue;
    }
    m.push(l);
  }
  let u = /* @__PURE__ */ new Map();
  for (let l of t.fingerprints ?? []) l.industry === t.industry && u.set(`${l.power}|${l.uses_set}`, l.count);
  let f = t.scansInIndustry ?? 0, h = (l) => {
    let b = l.score.score, v = `${l.candidate.power}|${W(l.candidate, l.gate.repaired_uses)}`, A = u.get(v) ?? 0;
    return f > 0 && A / f > o && l.score.confidence < w && (b *= c), b;
  }, i = [], p = /* @__PURE__ */ new Map(), y = m.slice();
  for (; i.length < s && y.length; ) {
    let l = null;
    for (let b of y) {
      if ((p.get(b.candidate.power) ?? 0) >= r) continue;
      let v = h(b);
      for (let A of i) {
        let we = A.candidate.moment === b.candidate.moment, ye = Ae(A.gate.repaired_uses ?? A.candidate.uses, b.gate.repaired_uses ?? b.candidate.uses);
        (we || ye > 0.5) && (v *= n);
      }
      (!l || v > l.v) && (l = { s: b, v });
    }
    if (!l) break;
    i.push(l.s), p.set(l.s.candidate.power, (p.get(l.s.candidate.power) ?? 0) + 1), y = y.filter((b) => b !== l.s);
  }
  let _ = y.filter((l) => l.gate.lane !== "spec");
  _.sort((l, b) => b.score.impact - l.score.impact);
  let a = _[0] ?? null;
  for (let l of y)
    l !== a && g.push({ candidate: l.candidate, reason: "ranked below the cut or too similar to a selected idea" });
  return { selected: i, wild: a, excluded: g };
}
function V(e, t) {
  let s = /* @__PURE__ */ new Map();
  for (let r of [...e.selected, ...e.wild ? [e.wild] : []]) {
    let n = W(r.candidate, r.gate.repaired_uses), o = `${r.candidate.power}|${n}`, c = s.get(o) ?? { industry: t, uses_set: n, power: r.candidate.power, count: 0 };
    c.count += 1, s.set(o, c);
  }
  return [...s.values()];
}

// src/v2.ts
function M(e) {
  if (!e) return null;
  let t = e.indexOf("{"), s = e.lastIndexOf("}");
  if (t < 0 || s <= t) return null;
  try {
    return JSON.parse(e.slice(t, s + 1));
  } catch {
    return null;
  }
}

// src/names.ts
var Ne = ["June", "Cal", "Rosie", "Tess", "Hank", "Wes", "Max", "Nora", "Ellie", "Grace", "Theo", "Paige", "Lena", "Remy", "Owen", "Mae", "Gus", "Della", "Milo", "Nell", "Abe", "Lou", "Kit", "Hazel", "Otis", "Bea", "Sid", "Faye", "Arlo", "Vera"], Re = /* @__PURE__ */ new Set(["June", "Rosie", "Tess", "Nora", "Ellie", "Grace", "Paige", "Lena", "Mae", "Della", "Nell", "Hazel", "Bea", "Faye", "Vera", "Kit"]), Oe = { answers: "Front desk", booking: "Scheduler", phone: "Phone desk", reviews: "Customer care", followup: "Follow-up coordinator", assistant: "Office assistant", other: "Team assistant" }, T = (e, t) => typeof e == "string" ? e.replace(/\s+/g, " ").replace(/—/g, ", ").trim().slice(0, t) : "";
function Pe(e, t) {
  let s = e || {}, r = T(s.name, 14).replace(/[^A-Za-z'-]/g, "");
  return r = r ? r.charAt(0).toUpperCase() + r.slice(1) : "", {
    name: /^[A-Z][a-z'-]{1,11}$/.test(r) ? r : "",
    role: (T(s.role, 32) || Oe[t] || "Team assistant").replace(/^AI\s+/i, ""),
    intro: T(s.intro, 220),
    voice: T(s.voice, 90),
    hours: T(s.hours, 48),
    handoff: T(s.handoff, 70),
    house: s.house === "m" || s.house === "f" ? s.house : null
  };
}
function Y(e, t = "", s = []) {
  let r = new Set(s.filter(Boolean).map((o) => o.toLowerCase())), n = (o) => !o || r.has(o.toLowerCase()) || new RegExp(`\\b${o}\\b`).test(t);
  return e.map((o) => {
    let c = Pe(o.teammate, o.power);
    return n(c.name) && (c.name = Ne.find((w) => !n(w)) || `Sam${r.size}`, c.house = null), c.house = c.house || (Re.has(c.name) || /(a|ie|y|elle|ette|ine)$/i.test(c.name) && !/^(Andy|Eddie|Joey|Jay|Ray|Guy|Luca|Ezra|Noa)$/i.test(c.name) ? "f" : "m"), r.add(c.name.toLowerCase()), { ...o, teammate: c };
  });
}

// src/types.ts
var j = [
  "home",
  "health",
  "auto",
  "salon",
  "restaurant",
  "realestate",
  "fitness",
  "retail",
  "other"
], K = {
  home: { label: "Home services", unit: "jobs" },
  health: { label: "Health & dental", unit: "patients" },
  auto: { label: "Auto repair", unit: "repairs" },
  salon: { label: "Salon & spa", unit: "clients" },
  restaurant: { label: "Restaurant or caf\xE9", unit: "guests" },
  realestate: { label: "Real estate", unit: "clients" },
  fitness: { label: "Fitness studio", unit: "members" },
  retail: { label: "Retail shop", unit: "customers" },
  other: { label: "Something else", unit: "clients" }
};
var z = ["Leads", "Bookings", "Customers", "Reviews", "Sales", "Operations", "Marketing", "Admin"], Q = [
  "night",
  "missed",
  "quote",
  "season",
  "review",
  "dispatch",
  "answers",
  "noshow",
  "winback",
  "briefing",
  "paperwork",
  "check",
  "globe",
  "page",
  "chip",
  "pin",
  "store"
];

// src/prompts/shared.ts
var S = `Hard rules:
- Use only facts in the material. Never invent numbers, prices, names, staff, years, awards or reviews.
- Any number you write must appear in the material, or be a count you made from the reviews given.
- Never repeat personal, family or health details about reviewers or anyone they mention (illness, injury, disability, relatives, children, caregivers). Staff names and what reviewers praised are fine.
- If the website blocked our scanner, never say the site lacks something (chat, booking, a form, a phone number, email). Say you couldn't check it.
- Services come from the business's own website or Google listing, never from what a reviewer mentioned.
- For reviews, recommend asking every customer. Never suggest asking only happy customers.
- Plain words, short sentences, specific to this business. Talk to the owner as "you". No hype. No em dashes.
- Return one JSON object and nothing else.`, $e = `- Sound like a warm, capable person on their team, never like software or a brochure. Contractions, everyday words, short sentences. Use the customer's first name once you know it.
- Meet people where they are: acknowledge their situation in a few words (e.g. "A banging boiler at night is no fun"), then help. Never open with "No".
- Honest about being AI: in your first message, say your name, that you're the business's AI assistant, and your job (e.g. "I'm June, Goodson's AI front desk"). If asked whether you're a person, say you're an AI and offer a real person. Never claim to be human. Never invent a personal life, feelings or where you are.
- One question at a time and one clear next step. Repeat details back so people know you got them right. Say when they'll hear back.
- If you don't know: "Good question, let me get you the right answer," then hand it to the team. Never guess prices, insurance, diagnoses or availability.`, Z = `HOW THE TEAM SOUNDS (every teammate follows this; it is how the best front desks, dispatchers and office staff talk)
${$e}
- Texts: 1-2 short sentences, their first name and the business, one ask. Review and marketing texts go only to people who agreed to texts and end with "Reply STOP to opt out".
- Emails: under 100 words, mention their real job or visit, one easy next step and an easy "not now", signed with the teammate's name and "AI assistant, <business>".
- Follow-ups: same day or next morning, remind them who you are, mention the specific job, invite questions. No fake urgency, no "just checking in", no apologizing for price, at most two.
- Review asks: every customer, while it's fresh, thank them first, one link, no rewards, never only the happy ones.
- Review replies: thank them, mention one specific detail, credit the staff member they praised, about 40 words, varied wording, and it posts on its own for 4-5 star reviews; replies to 1-3 star reviews go to the owner first. Health businesses never confirm someone is a patient.
- Calls: answer incoming calls, or call back people who asked for a call. Never cold-call or cold-text anyone.`, X = `AUTOPILOT (every teammate runs on its own; this is the product)
- Each teammate finishes the job end to end inside the owner's own tools: it books into their calendar, booking or job software, sends the follow-up, posts the reply, files the request. The owner never has to finish its work.
- The owner sets the rules once at setup (hours, areas, wording, what it may book). After that it acts without asking.
- "asks" lists the only exceptions it hands the owner instead of acting (a 1-3 star review, an emergency, anything with a price). Everything else it completes.
- "measure" is the line it adds to the owner's Monday report.
- Never design a teammate that only drafts or suggests for the owner to send, unless NEVER DESIGN requires a person (prices, discounts, refunds, contracts, money). Then it does everything up to that point and hands over only that step.`, ee = `Demo kinds (pick the one that shows the skill best):
- {"kind":"chat","opener": a realistic first message from a customer, "persona": instructions for the teammate who plays this job: "You are <name>, <business>'s AI <role>", what they know (real services, hours, area, policies from the material), how they talk (follow HOW THE TEAM SOUNDS), what they do (book, qualify, route), what they must never claim}
- {"kind":"flow","steps":[{"at": when, e.g. "Day 0" or "8:02 PM","text": what happens, quoting the teammate's actual words where it helps}] 4-6 steps}
- {"kind":"message","channel":"text"|"email","to": who receives it,"subject": for email,"body": the actual message, written by the teammate following HOW THE TEAM SOUNDS}
- {"kind":"brief","title": e.g. "7:00 AM briefing","lines": 3-5 lines}
- {"kind":"board","title": e.g. "Friday 7:40 PM, the floor","rows":[{"label": a table, line or station, "value": what the teammate shows for it right now}] 4-6 rows, counts and times only, never people}`, te = `"teammate": the AI teammate who does this job, so the owner meets a member of their team, not a tool: {"name": one warm, common first name (one word) that suits this business and area. Never the name of anyone in the material (staff, reviewers, competitors). Every skill gets a different name. "role": their job title the way a small business would say it, naming a person, not a task, 2-4 words (e.g. "Night front desk", "Follow-up coordinator", "After-hours receptionist"), "intro": their first words to the owner, first person, one sentence, specific to this business (e.g. "I'll answer homeowners on your site at night and get anything urgent to your on-call plumber fast."), "voice": how they sound, matched to what customers praise in the reviews, under 10 words, "hours": when they work, under 6 words, "handoff": the person or role on the owner's team they hand things to, under 8 words, "house": "f" or "m", whichever of the team's two house voices (female, male) suits the name}`, N = `WHAT SKILLS CAN BE BUILT FROM (every skill must be possible in the real world today with these. Each skill lists the ids it uses in "uses". Respect every rule shown)
${U()}

NEVER DESIGN
- ${R.join(`
- `)}

The range of what is possible, for inspiration only (never copy these; invent what fits THIS business): ${O.join("; ")}.
Demos, steps and stories must only show what the listed capabilities can really do.`, se = `one of ${j.map((e) => `"${e}"`).join(", ")} (${j.map((e) => `${e}=${K[e].label}`).join("; ")})`, ne = z.map((e) => `"${e}"`).join(", "), re = Q.map((e) => `"${e}"`).join(", ");

// src/prompts/understand.ts
function L(e) {
  let t = e.pages.map((n) => `## ${n.title} (${n.url})
${n.text.slice(0, n.rendered ? 9e3 : 2600)}`).join(`

`).slice(0, 16e3), s = (e.place?.reviews || []).map((n, o) => `${o + 1}. ${n.rating ? n.rating + "★ " : ""}${n.when || ""}: ${n.text.slice(0, 700)}`).join(`
`), r = e.competitors.map((n) => `- ${n.name}: ${n.rating ?? "?"}★ from ${n.count ?? "?"} reviews, ${n.distanceMi ?? "?"} mi away. Tools on their site: ${n.tools.map((o) => o.vendor).join(", ") || "none detected"}. Beyond the site: ${(n.signals || []).map((o) => o.name).join(", ") || "nothing found"}`).join(`
`);
  return [
    `WEBSITE: ${e.domain}${e.siteBlocked ? e.rendered ? " (our scanner was blocked, so the homepage text below comes from a full browser load; tools on the site could not be checked)" : " (the site blocked our scanner; rely on Google data)" : ""}`,
    `TITLE: ${e.meta.title || ""}`,
    `DESCRIPTION: ${e.meta.description || ""}`,
    e.ld.length ? `STRUCTURED DATA: ${JSON.stringify(e.ld).slice(0, 2500)}` : "",
    e.place && e.place.id !== "owner" ? `GOOGLE LISTING: ${e.place.name}, ${e.place.address || ""}. Rating ${e.place.rating ?? "?"} from ${e.place.count ?? "?"} reviews. Type: ${e.place.primaryType || "?"}. Hours: ${(e.place.hours || []).join("; ") || "?"}. Phone: ${e.place.phone || "?"}` : "GOOGLE LISTING: not available",
    s ? `REVIEWS WE CAN READ (${e.place.reviews.length} of them; these are the only reviews you have):
${s}` : "REVIEWS: none available",
    `TOOLS DETECTED ON THEIR SITE: ${e.detected.map((n) => `${n.vendor} (${n.id}, ${n.evidence})`).join("; ") || "none"}`,
    `TOOLS FOUND BEYOND THE SITE (public DNS, email, wording): ${(e.signals?.items || []).map((n) => `${n.name} [${n.strength}]: ${n.meaning} (${n.evidence})`).join("; ") || "none"}`,
    e.signals?.socials?.length ? `SOCIAL PAGES: ${e.signals.socials.map((n) => n.network).join(", ")}` : "",
    `PHONES ON SITE: ${e.phones.join(", ") || "none"}. EMAILS: ${e.emails.join(", ") || "none"}`,
    r ? `NEARBY COMPETITORS (from Google):
${r}` : "NEARBY COMPETITORS: none found",
    `PAGES:
${t}`
  ].filter(Boolean).join(`

`);
}
function C(e, t) {
  return `You are Pip, an expert AI consultant for small businesses. Study this business closely. You will present it back to the owner, so they should feel you know their business inside out.

${S}

MATERIAL
${L(e)}
${t ? `
THE OWNER SAYS: ${t}` : ""}

Return JSON:
{
  "name": business name as customers know it,
  "industry": ${se},
  "oneLiner": what they do and for whom, under 16 words,
  "services": their main services in their own words (max 12),
  "since": how long they've been in business, in a short phrase, only if the material says it (e.g. "Family-owned since 1997"), else "",
  "people": names of the owner and staff as written on their site or in reviews (max 6), never the reviewers themselves,
  "echo": 2-4 short phrases copied word for word from their own website that sound like them (a tagline, a promise, how they describe themselves), each under 60 characters,
  "customers": who their customers are and what they usually need, one sentence,
  "area": towns or area served, short,
  "hours": short hours text,
  "phone": main phone,
  "facts": up to 5 short, true, specific details that make this business distinct: [{"text": the detail in your words, under 100 characters, "quote": the exact words from the material (or from what the owner says) that show it, copied word for word, under 120 characters}]. A detail you can't back with a quote doesn't belong here,
  "glance": up to 4 at-a-glance facts for a profile card, each a big short value and a label, only from the material, never the Google rating or review count (shown elsewhere): [{"big": under 8 characters, e.g. "1997" or "24/7" or "6", "label": under 28 characters, e.g. "family-owned since" or "emergency service" or "towns served"}],
  "aiToday": {
    "score": 0-100, how well AI and automation cover their customer journey today (0 = everything manual, 100 = fully covered). Be honest and consistent: chat that only answers FAQs ~10-20, online booking ~15-25, AI phone ~20-30, combined systems higher.
    "verdict": a 3-6 word headline,
    "items": what they use today, including manual ones (phone-only booking, a contact form) and tools found beyond the site. A tool marked [available] is included in something they pay for (like Copilot in Microsoft 365) but we can't see if they use it: say exactly that. [{"name","kind":"ai"|"tool"|"manual","does": what it handles, "misses": what it can't do for this business}] (2-6 items),
    "gaps": the 3 biggest gaps for THIS business: [{"area": 2-3 words, "detail": one specific sentence}]. Only state what the material shows. Follow-ups, reminders, phone answering and back-office tools can't be seen from outside: for those, say what you saw and ask instead of claiming it's missing (e.g. "You give fast estimates. I can't see from outside whether quiet homeowners get a follow-up."). Never suggest asking only happy customers for reviews.
  },
  "reviews": {
    "summary": one sentence on what customers love and what frustrates them,
    "themes": up to 5 themes from the reviews given: [{"label": 2-5 words, "count": how many of the given reviews mention it, "quote": a short exact phrase from a review, "sentiment": "positive"|"negative"}]
  },
  "competition": {
    "summary": one sentence on how they compare nearby,
    "edges": {"<competitor name>": "what that competitor has or does better, from the material, or empty"}
  },
  "narration": {
    "who": Pip opening the presentation about this business (1-2 sentences, cites a real detail),
    "ai": Pip presenting their AI today (1-2 sentences),
    "reviews": Pip presenting what customers say (1-2 sentences, quote-worthy),
    "competition": Pip presenting the competition (1-2 sentences)
  }
}`;
}
function oe(e, t) {
  return `You turn what Pip learned about a business into a list of SIGNALS. A signal is one checkable claim with its evidence and an honest status.

Status rules (strict):
- "seen": the material shows it directly (a quote from their site or listing, a tool detected on their site, a review that says it).
- "inferred": a reasonable reading of the material, not stated outright.
- "unknown": cannot be seen from outside (follow-ups, reminders, phone answering, back-office tools, what happens after hours). An unknown is NEVER turned into "they don't have it".

${S}

PROFILE
${JSON.stringify(e)}

RIVAL FOOTPRINT
${t}

Return JSON:
{"signals":[{"id": short_snake_id, "claim": one sentence, "status":"seen"|"inferred"|"unknown", "evidence":[{"quote": exact words from the material under 120 characters, or "url": a page, "source":"review"|"site"|"competitor"|"google"|"dns"|"ads"|"jobs"|"social"}], "confidence": 0-1}]}
12 to 25 signals covering: what they sell, who they serve, hours versus when customers reach out, how they take bookings and calls, what customers praise and complain about, which tools they already use, what each named rival does that they don't, and what physical or data assets they have (rooms, tables, trucks, inventory, a POS, a booking tool, cameras mentioned anywhere).`;
}

// src/prompts/invent.ts
var Me = {
  journey: "CUSTOMER JOURNEY, HOUR BY HOUR: walk a typical customer from the first search to the last follow-up. Where do they wait, repeat themselves, hear nothing, or give up? Which hour of which day is worst?",
  building: "THE BUILDING AND THE PHYSICAL WORLD: what in their rooms, tables, chairs, bays, trucks, shelves, waiting area or parking could be counted or sensed, and what would the owner do differently if they knew it live?",
  owner_night: "THE OWNER'S 9 PM: what does the owner or manager do after close, on paper, in a spreadsheet, by memory, or not at all?",
  money: "MONEY LEAKS: no-shows, unanswered calls, slow quotes, empty slots, tables that sit dirty, past customers who never came back, reviews never answered.",
  data: "DATA THEY ALREADY HAVE BUT DON'T USE: their POS, booking tool, calendar, reviews, invoices, camera system, order history. What could it predict or flag?",
  rival: "RIVAL EDGE: what the best nearby rival does that they do not, and what no rival does yet that would make this business the obvious choice.",
  team: "THE TEAM'S OWN WORK: estimates, letters, schedules, inventory counts, training, hiring, the things staff retype or redo."
};
function ae(e, t, s) {
  return `You are Pip, a sharp analyst who has just studied a small business. Before designing anything, map where this business leaks time or money. These are MOMENTS, not products: a specific hour, a specific situation, a specific person waiting.

${S}
- A moment must rest on evidence: a signal with status "seen" or "inferred", a review theme, a gap, a rival edge, their hours against when customers reach out, or a physical or data asset they have.
- At least 3 of your moments must be outside these familiar patterns: ${O.join("; ")}.
- At least 2 of your moments must exploit a physical or data asset this business has (rooms, tables, bays, trucks, shelves, a waiting area, a POS, a booking tool, a calendar, invoices, cameras).
- Severity is 1-5: 5 = many reviews or a daily event or a rival clearly winning on it; 1 = plausible but thin.
- An "unknown" signal cannot make a moment severe; say what you could not see.

WHAT WE KNOW
${JSON.stringify({ name: e.name, industry: e.industry, oneLiner: e.oneLiner, services: e.services, customers: e.customers, area: e.area, hours: e.hours, facts: e.facts, aiToday: e.aiToday, reviews: e.reviews, competition: e.competition })}

SIGNALS
${JSON.stringify(t)}

RIVAL SIGNALS
${JSON.stringify(s)}

Return JSON:
{"moments":[{"id": short_snake_id, "when": one specific moment under 8 words (e.g. "9:40 PM on a Sunday", "Friday 7:30 PM, a full dining room"), "what": what goes wrong or gets lost, one or two sentences, "severity": 1-5, "evidence":[{"quote": exact words from the material under 120 characters, "source":"review"|"site"|"competitor"|"google"|"dns"|"ads"|"jobs"|"social"}], "signals":[signal ids this rests on], "asset": the physical or data asset it exploits, or ""}]}
8 to 15 moments, most severe first.`;
}
function ie(e, t, s) {
  let r = s.lenses.map((o) => `- ${Me[o]}`).join(`
`), n = (s.negative ?? []).slice(0, 8).map((o) => `- ${o.power} built from ${o.uses_set.split("+").join(", ")}`).join(`
`);
  return `You are Pip, a senior AI solutions designer. Invent AI teammates for THIS business, each one answering a specific moment below. You are inventing, not picking from a menu: combine the building blocks in ways that fit this business and nobody else's.

Look through these lenses and nothing else:
${r}

${N}

${S}
- A teammate only counts as personal if it wouldn't make sense for every business in the same industry. If it would, cut it or make it specific to a moment here.
- Every idea names the moment it answers, uses only ids from the list above in "uses", and backs each claim with evidence and an honest status ("seen", "inferred", "unknown").
- Ideas that need hardware on site or custom code are welcome when the moment deserves them; the owner decides. Say what they need.
- Do not pad. Return ${s.count[0]} to ${s.count[1]} ideas, most promising first.
${n ? `
These shapes have been offered to many businesses like this one lately. Do not repeat them unless the evidence here is unusually strong:
${n}` : ""}

WHAT WE KNOW
${JSON.stringify({ name: e.name, industry: e.industry, oneLiner: e.oneLiner, services: e.services, customers: e.customers, area: e.area, hours: e.hours, facts: e.facts, aiToday: e.aiToday, reviews: e.reviews, competition: e.competition })}

MOMENTS
${JSON.stringify(t)}

Return JSON:
{"ideas":[{"id": short-kebab-id, "name": a memorable 2-3 word name for the job, made for this business, "moment": a moment id, "power": "answers"|"booking"|"phone"|"reviews"|"followup"|"assistant"|"other", "uses":[primitive ids], "claims":[{"text": one factual claim this idea depends on, "status":"seen"|"inferred"|"unknown", "evidence":[{"quote": exact words under 120 characters, "source":"review"|"site"|"competitor"|"google"|"dns"|"ads"|"jobs"|"social"}]}], "data_needed":[what the owner would have to share or connect], "why_personal": one sentence on why this wouldn't make sense for every business in the industry}]}`;
}
var de = [
  { tier: "opus", lenses: ["journey", "money", "rival"], count: [7, 10] },
  { tier: "sonnet", lenses: ["building", "data", "owner_night", "team"], count: [6, 10] }
];
function le(e, t, s) {
  return `You are Pip, a senior AI solutions designer. This idea for ${e.name} failed a feasibility check. Return the closest version that passes, keeping the same moment and intent. If a claim cannot be backed by the material, remove it or mark its status "unknown"; never invent evidence. Use only primitive ids from the list.

${N}

${S}

THE IDEA
${JSON.stringify(t)}

WHAT FAILED
- ${s.join(`
- `)}

Return JSON for the corrected idea only: {"id","name","moment","power","uses":[],"claims":[{"text","status","evidence":[]}],"data_needed":[],"why_personal"}`;
}

// src/prompts/render.ts
var je = (e) => JSON.stringify({ name: e.name, industry: e.industry, oneLiner: e.oneLiner, services: e.services, customers: e.customers, area: e.area, hours: e.hours, facts: e.facts, aiToday: e.aiToday, reviews: e.reviews, competition: e.competition });
function ce(e, t, s, r, n, o) {
  return `You are Pip, a senior AI solutions designer. Develop ONE AI skill for THIS business from the idea below, designed from scratch for them: its name, job, wording, story and demo must be about their real services, customers, reviews, tools and competition. No generic products: a skill that would make sense for any business in their industry is not personal enough.

THE IDEA
${JSON.stringify({ name: s.name, power: s.power, uses: r.repaired_uses ?? s.uses, claims: s.claims, why_personal: s.why_personal, moment: n })}
Lane: ${r.lane}. Tier: ${r.tier}. Risk flags: ${r.risk.join(", ") || "none"}. The owner will need: ${r.needs.join("; ") || "nothing special"}.
Keep "uses" exactly as given. Teammate names already taken by this business's other skills: ${o.join(", ") || "none"}.

${N}

${S}

${Z}

${X}

WHAT WE KNOW
${je(e)}

SOURCE MATERIAL
${t.slice(0, 14e3)}

Return JSON:
{
  "id": short-kebab-id,
  "name": a memorable 2-3 word name for the job, made for this business,
  ${te},
  "uses": [capability ids it is built from],
  "power": the AI power it adds: "answers" (answers customers), "booking" (booking), "phone" (calls and urgent requests), "reviews" (reputation), "followup" (follow-up and repeat business), "assistant" (AI for the team's own work), or "other",
  "tagline": what it does for this business, under 12 words,
  "category": one of ${ne},
  "icon": one of ${re},
  "why": the evidence in one sentence under 20 words (cite a review theme, a service, a gap, or a competitor),
  "fixes": [0-based indexes of the gaps in aiToday.gaps that this skill fixes, may be empty],
  "evidence": [{"source":"review"|"site"|"competitor"|"google","text": short specific evidence}] (1-3),
  "how": exactly 3 short steps of what it does,
  "impact": the outcome for the owner in plain words, no invented numbers,
  "connects": names of their existing tools it works with (from the material, may be empty),
  "demo": a demo,
  "match": 60-98, how strongly the evidence supports it,
  "story": {"when": one specific moment in this business, under 8 words, e.g. "9:40 PM on a Sunday", "before": what happens today in that moment (1-2 sentences, from the material), "after": what happens with this skill (1-2 sentences)},
  "setup": 2-3 short steps the owner does once to switch it on, including setting its rules,
  "wont": 2-3 things it will never do,
  "asks": the 1-2 exceptions it hands the owner instead of acting (everything else it finishes on its own), under 80 characters each (e.g. "Any reply to a 1-3 star review", "Booking a job over two hours away"),
  "measure": the line it adds to the owner's Monday report, one plain thing, something they can count themselves, under 90 characters (e.g. "After-hours requests that turned into booked jobs"), no numbers or targets,
  "faq": 3 questions this owner would ask about it, with short honest answers: [{"q","a"}],
  "hardware": null, or if the skill needs something on site: {"sku": "", "cameras": how many camera views it needs, "zones": "drawn at install"},
  "data_contract": null, or if the skill writes rows somewhere: {"sink": the sink id, "columns": [column names in plain words], "cadence": "live"|"hourly"|"daily"|"weekly"}
}

${ee}`;
}
function ue(e, t, s) {
  return `You write a private, blunt brief for the founder who will sell and deliver AI teammates to this business. The owner never sees it.

BUSINESS
${JSON.stringify({ name: e.name, industry: e.industry, oneLiner: e.oneLiner, hours: e.hours, aiToday: e.aiToday, reviews: e.reviews.summary, competition: e.competition.summary })}

SELECTED
${JSON.stringify(t)}

REJECTED OR CUT
${JSON.stringify(s)}

Return JSON:
{"scope": two sentences on what we would actually build first and why, "risks":[the compliance, technical or relationship risks, one line each], "confirm_on_call":[the 3-5 things we could not see from outside and must ask the owner], "price_band_hint": a rough tier word (starter | standard | custom) with one reason, no dollar amounts, "objections":[the 2-4 objections this owner will raise and a one-line honest answer to each]}`;
}
function me(e, t) {
  let s = e.map((r) => `### ${r.id}
${[r.name, ...r.claims.map((n) => n.text), r.why_personal].filter(Boolean).map((n, o) => `${o + 1}. ${n}`).join(`
`)}`).join(`

`);
  return `Decide, for each idea below, whether any of its statements describes something on the NEVER DESIGN list. Be literal. Explaining a business's own services, booking a professional, or counting people without identifying them is allowed.

NEVER DESIGN
- ${t.join(`
- `)}

IDEAS
${s}

Return JSON: {"hits": {"<idea id>": the rule text it breaks copied exactly, or null, ...}} with one entry per idea id.`;
}

// src/pipeline.ts
var he = ["understand", "opportunity", "invent", "gate", "render", "brief"], Le = () => (/* @__PURE__ */ new Date()).toISOString();
async function x(e, t, s, r) {
  let n = await e(t, s, r), o = M(n);
  if (o) return o;
  let c = await e(`${t}

That reply was not valid JSON. Return only the corrected JSON object, nothing else.`, "sonnet", `${r}:fix`), w = M(c);
  if (!w) throw new Error(`${r}: bad JSON`);
  return w;
}
function pe(e) {
  return { input: e, stage: "understand", events: [] };
}
var I = (e, t, s) => e.events.push({ stage: t, at: Le(), payload: s }), Ce = (e) => he[he.indexOf(e) + 1] ?? "done";
async function ge(e, t) {
  if (e.stage === "done") return e;
  let s = e.input, r = L(s.raw);
  switch (e.stage) {
    case "understand": {
      let n = s.profile;
      if (!n) {
        let c = s.raw.pages.map((w) => w.text).join("").length > 4e4 ? "opus" : "sonnet";
        n = await x(t, C(s.raw, s.ownerSays), c, "understand"), n.industry === "other" && c !== "opus" && (n = await x(t, C(s.raw, s.ownerSays), "opus", "understand:other"));
      }
      e.profile = n, I(e, "understand", { name: n.name, industry: n.industry, score: n.aiToday?.score });
      let o = await x(t, oe(n, s.rivalsFootprint ?? ""), "haiku", "signals");
      e.signals = (o.signals || []).filter((c) => c && c.id && c.claim), I(e, "signals", { count: e.signals.length, seen: e.signals.filter((c) => c.status === "seen").length });
      break;
    }
    case "opportunity": {
      let n = await x(t, ae(e.profile, e.signals ?? [], s.rivalSignals ?? []), "opus", "opportunity");
      e.moments = (n.moments || []).filter((o) => o && o.id), I(e, "opportunity", { count: e.moments.length, top: e.moments.slice(0, 3).map((o) => o.when) });
      break;
    }
    case "invent": {
      let n = e.profile.industry || "other", o = s.samples ?? de, c = (s.fingerprints ?? []).filter((u) => u.industry === n && s.scansInIndustry && u.count / s.scansInIndustry > 0.3), w = await Promise.all(o.map(
        (u) => x(t, ie(e.profile, e.moments ?? [], { lenses: u.lenses, count: u.count, negative: c }), u.tier, `invent:${u.lenses.join("+")}`).then((f) => (f.ideas || []).map((h) => ({ ...h, lens: u.lenses.join("+") }))).catch(() => [])
      )), g = /* @__PURE__ */ new Set(), m = [];
      for (let u of w.flat()) {
        if (!u || !u.id || !Array.isArray(u.uses)) continue;
        let f = u.id, h = 2;
        for (; g.has(f); ) f = `${u.id}-${h++}`;
        g.add(f), m.push({ ...u, id: f, claims: Array.isArray(u.claims) ? u.claims : [] });
      }
      e.candidates = m, I(e, "invent", { count: m.length });
      break;
    }
    case "gate": {
      let n = e.profile.industry || "other", o = e.candidates ?? [], c = await x(t, me(o, R), "haiku", "gate:never").catch(() => ({ hits: {} })), w = { industry: n, state: s.state, material: r, neverDesign: void 0 }, g = {}, m = 0;
      for (let h = 0; h < o.length; h++) {
        let i = o[h], p = await $(i, { ...w, neverDesign: async () => c.hits?.[i.id] || null });
        if (p.status === "repair") {
          let y = await x(t, le(e.profile, i, p.errors), "sonnet", `repair:${i.id}`).catch(() => null);
          if (y && Array.isArray(y.uses)) {
            let _ = { ...i, ...y, id: i.id, lens: i.lens, claims: Array.isArray(y.claims) ? y.claims : [] }, a = await $(_, { ...w, neverDesign: async () => c.hits?.[i.id] || null });
            a.status === "pass" ? (o[h] = _, p = a, m++) : p = { ...a, status: "drop", errors: [...p.errors, "repair failed: " + a.errors.join("; ")] };
          } else
            p = { ...p, status: "drop", errors: [...p.errors, "repair failed: no usable reply"] };
        }
        g[i.id] = p;
      }
      e.candidates = o, e.gates = g;
      let u = Object.values(g);
      I(e, "gate", { repaired: m, pass: u.filter((h) => h.status === "pass").length, repair: u.filter((h) => h.status === "repair").length, drop: u.filter((h) => h.status === "drop").length });
      let f = new Map((e.moments ?? []).map((h) => [h.id, h]));
      e.scored = o.map((h) => {
        let i = g[h.id];
        return { candidate: h, gate: i, score: H(h, i, f) };
      }), e.selection = J(e.scored, { industry: n, keep: s.keep ?? 6, fingerprints: s.fingerprints, scansInIndustry: s.scansInIndustry }), e.fingerprints = V(e.selection, n), I(e, "score", { selected: e.selection.selected.map((h) => ({ id: h.candidate.id, score: h.score.score })), wild: e.selection.wild?.candidate.id ?? null, excluded: e.selection.excluded.length });
      break;
    }
    case "render": {
      let n = e.profile, o = e.selection, c = new Map((e.moments ?? []).map((i) => [i.id, i])), w = Math.max(0, ...(e.scored ?? []).map((i) => i.score.impact)), g = [...o.selected, ...o.wild ? [o.wild] : []], m = await Promise.all(g.map(
        (i) => x(t, ce(n, r, i.candidate, i.gate, c.get(i.candidate.moment), []), "sonnet", `render:${i.candidate.id}`).catch(() => null)
      )), u = {};
      g.forEach((i, p) => {
        let y = m[p];
        if (!y) return;
        let _ = i.gate.repaired_uses ?? i.candidate.uses, a = i.candidate.claims.some((l) => l.status === "seen");
        u[i.candidate.id] = {
          ...y,
          id: y.id || i.candidate.id,
          uses: _,
          fixes: a ? Array.isArray(y.fixes) ? y.fixes : [] : [],
          match: F(i.score, w),
          tier: i.gate.tier,
          lane: i.gate.lane,
          risk: i.gate.risk,
          needs: i.gate.needs,
          moment: i.candidate.moment,
          wild: i === o.wild
        };
      });
      let f = [...n.people ?? [], ...Object.keys(n.competition?.edges ?? {})].join(" "), h = Y(Object.entries(u).map(([i, p]) => ({ key: i, ...p })), `${r} ${f}`);
      e.skills = {};
      for (let i of h) {
        let { key: p, ...y } = i;
        e.skills[p] = y;
      }
      I(e, "render", { count: Object.keys(e.skills).length });
      break;
    }
    case "brief": {
      let n = e.selection, o = [...n.selected, ...n.wild ? [n.wild] : []];
      e.founder_brief = await x(t, ue(
        e.profile,
        o.map((c) => ({ name: c.candidate.name, lane: c.gate.lane, tier: c.gate.tier, risk: c.gate.risk, needs: c.gate.needs })),
        n.excluded.map((c) => ({ name: c.candidate.name, reason: c.reason }))
      ), "haiku", "brief").catch(() => null), I(e, "brief", { ok: !!e.founder_brief });
      break;
    }
  }
  return e.stage = Ce(e.stage), e;
}
function D(e) {
  return {
    profile: e.profile,
    signals: e.signals ?? [],
    moments: e.moments ?? [],
    candidates: e.candidates ?? [],
    gates: new Map(Object.entries(e.gates ?? {})),
    scored: e.scored ?? [],
    selection: e.selection ?? { selected: [], wild: null, excluded: [] },
    skills: new Map(Object.entries(e.skills ?? {})),
    founder_brief: e.founder_brief ?? null,
    fingerprints: e.fingerprints ?? [],
    events: e.events
  };
}
async function De(e, t) {
  let s = pe(e);
  for (; s.stage !== "done"; ) s = await ge(s, t);
  return D(s);
}
function fe(e, t = 4) {
  let s = e.signals.filter((m) => m.status === "unknown"), r = [...e.selection.selected, ...e.selection.wild ? [e.selection.wild] : []].map((m) => m.candidate), n = (m) => new Set(m.toLowerCase().match(/[a-z]{5,}/g) ?? []), o = (m, u) => {
    let f = n(m), h = 0;
    for (let i of n(u)) f.has(i) && h++;
    return h >= 2;
  }, c = s.map((m) => {
    let u = r.filter((f) => e.moments.find((i) => i.id === f.moment)?.signals.includes(m.id) || f.claims.some((i) => i.status === "unknown" && o(i.text, m.claim)) ? !0 : (f.data_needed ?? []).some((i) => o(i, m.claim))).map((f) => f.id);
    return { signal: m, dependents: u };
  }).filter((m) => m.dependents.length), w = new Map(e.scored.map((m) => [m.candidate.id, m.score.impact])), g = (m) => m.dependents.reduce((u, f) => u + (w.get(f) ?? 0), 0);
  return c.sort((m, u) => u.dependents.length - m.dependents.length || g(u) - g(m)), c.slice(0, t);
}
function Be(e) {
  let t = D(e), s = [...t.skills.values()];
  return {
    profile: t.profile,
    skills: s.filter((r) => !r.wild),
    wild: s.find((r) => r.wild) ?? null,
    ask: fe(t).map((r) => ({ id: r.signal.id, claim: r.signal.claim, affects: r.dependents })),
    excluded: t.selection.excluded.map((r) => ({ name: r.candidate.name, reason: r.reason })),
    signals: t.signals,
    moments: t.moments
  };
}

// src/adapters/anthropic.ts
var qe = {
  opus: "claude-opus-5-5",
  sonnet: "claude-sonnet-5-5",
  haiku: "claude-haiku-5-5"
}, Ue = {
  opus: { in: 4, out: 20, cacheRead: 0.2, cacheWrite: 5 },
  sonnet: { in: 2, out: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  haiku: { in: 0.1, out: 0.5, cacheRead: 0.01, cacheWrite: 0.125 }
};
function Ge(e) {
  let t = [`
WHAT WE KNOW
`, `
MATERIAL
`, `
PROFILE
`, `
THE IDEA
`, `
THE BUSINESS
`, `
THE SKILL (as presented`, `
BUSINESS
`, `
STATEMENTS
`], s = -1;
  for (let r of t) {
    let n = e.indexOf(r);
    n > 0 && (s < 0 || n < s) && (s = n);
  }
  return s < 2e3 ? { system: "", user: e } : { system: e.slice(0, s), user: e.slice(s) };
}
function He(e) {
  let t = { ...qe, ...e.models ?? {} }, s = { opus: 8e3, sonnet: 8e3, haiku: 4e3, ...e.maxTokens ?? {} }, r = e.fetchImpl ?? fetch, n = 0;
  return async (o, c, w) => {
    if (e.budgetUsd !== void 0 && n >= e.budgetUsd) throw new Error(`budget exceeded before ${w} ($${n.toFixed(3)})`);
    let { system: g, user: m } = Ge(o), u = {
      model: t[c],
      max_tokens: s[c],
      messages: [{ role: "user", content: m }]
    };
    g && (u.system = [{ type: "text", text: g, cache_control: { type: "ephemeral" } }]);
    let f = await r("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": e.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify(u)
    });
    if (!f.ok) {
      let a = await f.text().catch(() => ""), l = f.status === 429 ? "rate_limited" : `http_${f.status}`;
      throw new Error(`${w}: ${l} ${a.slice(0, 200)}`);
    }
    let h = await f.json(), i = (h.content || []).filter((a) => a.type === "text").map((a) => a.text || "").join(""), p = h.usage || { input_tokens: 0, output_tokens: 0 }, y = Ue[c], _ = (p.input_tokens * y.in + p.output_tokens * y.out + (p.cache_read_input_tokens ?? 0) * y.cacheRead + (p.cache_creation_input_tokens ?? 0) * y.cacheWrite) / 1e6;
    return n += _, e.onUsage?.({ stage: w, tier: c, input: p.input_tokens, output: p.output_tokens, cacheRead: p.cache_read_input_tokens ?? 0, cacheWrite: p.cache_creation_input_tokens ?? 0, usd: _ }), i;
  };
}
export {
  E as PRIMITIVES,
  He as anthropicModel,
  fe as askQuestions,
  pe as newState,
  De as runBrain,
  ge as runStage,
  Be as siteResult,
  D as toOutput
};
