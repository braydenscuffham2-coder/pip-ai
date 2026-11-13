#!/usr/bin/env node
// Activates an approved skill: sends its Skill Spec and business brain to the live runtime.
// Usage: PIP_ADMIN_TOKEN=... node scripts/activate.mjs setup.json [live|sandbox]
// setup.json = the "setup" document the sidebar saved (brain + built[] with spec per skill).
import { readFileSync } from 'node:fs';

const [file, status = 'sandbox'] = process.argv.slice(2);
const token = process.env.PIP_ADMIN_TOKEN;
const base = process.env.PIP_SERVER || 'https://pip-ai-drab.vercel.app';
if (!file || !token) { console.error('Usage: PIP_ADMIN_TOKEN=... node scripts/activate.mjs setup.json [live|sandbox]'); process.exit(1); }
const setup = JSON.parse(readFileSync(file, 'utf8'));
for (const b of setup.built || []) {
  if (b.state !== 'passed' || !b.spec) { console.log(`skip ${b.name}: ${b.state}`); continue; }
  const res = await fetch(`${base}/api/specs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-pip-admin': token },
    body: JSON.stringify({ business: setup.brain.business, domain: setup.domain || null, status, spec: b.spec, brain: setup.brain, quote: setup.quote, tests: b.tests }),
  });
  const out = await res.json();
  if (!res.ok) { console.error(`failed ${b.name}:`, out); continue; }
  console.log(`${b.name}: ${out.id}\n  <script src="${base}/widget.js" data-skill="${out.id}" async></script>${out.waitingOn?.length ? `\n  waiting on: ${out.waitingOn.map(w => w.label).join(', ')}` : ''}`);
}
