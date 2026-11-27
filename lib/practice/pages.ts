// The practice tool's pages, as plain HTML strings. Made-up "practice software" that Pip hosts for its own tests.
export const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
type Row = { id: string; data: Record<string, string> };

const CSS = `body{font:15px/1.5 system-ui,sans-serif;margin:0;color:#1a1f2b;background:#f6f7f9}
.test{background:#b42318;color:#fff;padding:6px 16px;font-size:13px}
header{background:#fff;border-bottom:1px solid #dde1e7;padding:10px 16px;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
header b{font-size:17px}nav a{margin-right:14px;color:#1d4ed8;text-decoration:none}
main{max-width:860px;margin:18px auto;padding:0 16px}h1{font-size:22px;margin:8px 0 14px}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #dde1e7}th,td{text-align:left;padding:8px 10px;border-bottom:1px solid #eceff3}
form.card,div.card{background:#fff;border:1px solid #dde1e7;padding:16px;margin:14px 0;border-radius:6px}
label{display:block;margin:10px 0 4px;font-weight:600}input,select,textarea{width:100%;max-width:420px;padding:8px;border:1px solid #b8c0cc;border-radius:4px;font:inherit;box-sizing:border-box}
button{padding:8px 14px;border:1px solid #1d4ed8;background:#1d4ed8;color:#fff;border-radius:4px;font:inherit;cursor:pointer;margin:12px 8px 0 0}
button.plain{background:#fff;color:#1d4ed8}button.danger{background:#fff;color:#b42318;border-color:#b42318}
.msg{background:#ecfdf3;border:1px solid #abefc6;padding:8px 12px;border-radius:4px;margin:10px 0}.err{background:#fef3f2;border-color:#fecdca}`;

export function page(title: string, body: string, nav?: { base: string; label: string; signedIn: boolean }): string {
  const links = nav ? `<nav><a href="${nav.base}/home">Home</a><a href="${nav.base}/patients">Patients</a><a href="${nav.base}/refills">Refill requests</a><a href="${nav.base}/notes">Notes</a><a href="${nav.base}/billing">Billing</a><a href="${nav.base}/security">Security</a></nav>${nav.signedIn ? `<form method="post" action="${nav.base}/logout" style="margin-left:auto"><button class="plain" style="margin:0">Sign out</button></form>` : ''}` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex, nofollow"><title>${esc(title)} · Practice tool (TEST)</title><style>${CSS}</style></head><body>
<div class="test">TEST practice tool. Made-up records for Pip's own testing. Not a real product and not a real clinic.</div>
<header><b>${esc(nav?.label || 'Practice tool')}</b>${links}</header><main><h1>${esc(title)}</h1>${body}</main></body></html>`;
}
const field = (name: string, label: string, value = '', attrs = '') => `<label for="f-${name}">${esc(label)}</label><input id="f-${name}" name="${name}" value="${esc(value)}" ${attrs}>`;
const pick = (name: string, label: string, value: string, options: string[]) => `<label for="f-${name}">${esc(label)}</label><select id="f-${name}" name="${name}">${options.map((o) => `<option${o === value ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`;

export const loginPage = (base: string, error = '') => page('Sign in', `${error ? `<p class="msg err">${esc(error)}</p>` : ''}<form class="card" method="post" action="${base}/login">${field('username', 'Email', '', 'type="email" autocomplete="username" required')}${field('password', 'Password', '', 'type="password" autocomplete="current-password" required')}<button type="submit">Sign in</button></form>`);
export const loginStepsPage = (base: string, username = '', error = '') => page('Sign in', `${error ? `<p class="msg err">${esc(error)}</p>` : ''}<form class="card" method="post" action="${base}/login-steps">${username
  ? `<p>Signing in as <b>${esc(username)}</b></p><input type="hidden" name="username" value="${esc(username)}">${field('password', 'Password', '', 'type="password" autocomplete="current-password" required')}<button type="submit">Sign in</button>`
  : `${field('username', 'Email', '', 'type="email" autocomplete="username" required')}<button type="submit">Next</button>`}</form>`);
export const verifyPage = (base: string, error = '') => page('Enter your code', `${error ? `<p class="msg err">${esc(error)}</p>` : ''}<form class="card" method="post" action="${base}/verify"><p>Enter the 6-digit code from your authenticator app.</p>${field('otp', 'Verification code', '', 'inputmode="numeric" autocomplete="one-time-code" required')}<button type="submit">Verify</button></form>`);
export const setupPage = (base: string, code: string, error = '') => page('Create the test sign-in', `${error ? `<p class="msg err">${esc(error)}</p>` : ''}<form class="card" method="post" action="${base}/setup"><p>Choose a sign-in for this test copy. Use a made-up password you use nowhere else. It is stored only as a one-way hash.</p><input type="hidden" name="code" value="${esc(code)}">${field('username', 'Email', '', 'type="email" autocomplete="username" required')}${field('password', 'Password (10 characters or more)', '', 'type="password" autocomplete="new-password" minlength="10" required')}<button type="submit">Create sign-in</button></form>`);

export function homePage(nav: Parameters<typeof page>[2], counts: { patients: number; refills: number; notes: number }, msg = ''): string {
  return page('Home', `${msg ? `<p class="msg">${esc(msg)}</p>` : ''}<div class="card"><p><b>${counts.patients}</b> patients · <b>${counts.refills}</b> refill requests · <b>${counts.notes}</b> notes</p><p><a href="${nav!.base}/patients">Open patients</a> · <a href="${nav!.base}/refills">Open refill requests</a></p></div>`, nav);
}
export function patientsPage(nav: Parameters<typeof page>[2], rows: Row[], msg = ''): string {
  return page('Patients', `${msg ? `<p class="msg">${esc(msg)}</p>` : ''}<p><a href="${nav!.base}/patients/new">Add a patient</a></p><table><thead><tr><th>Name</th><th>Species</th><th>Owner</th><th>Status</th><th>Reminders</th><th>Autoship</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.data.name)}</td><td>${esc(r.data.species)}</td><td>${esc(r.data.owner)}</td><td>${esc(r.data.status)}</td><td>${esc(r.data.reminders)}</td><td>${esc(r.data.autoship)}</td><td><a href="${nav!.base}/patients/${r.id}">Open ${esc(r.data.name)}</a></td></tr>`).join('')}</tbody></table>`, nav);
}
export function patientForm(nav: Parameters<typeof page>[2], r: Row | null): string {
  const d = r?.data ?? {}, action = r ? `${nav!.base}/patients/${r.id}` : `${nav!.base}/patients/new`;
  return page(r ? `Patient: ${d.name}` : 'Add a patient', `<form class="card" method="post" action="${action}">${field('name', 'Pet name', d.name, 'required')}${field('species', 'Species', d.species)}${field('owner', 'Owner name', d.owner)}${field('phone', 'Owner phone', d.phone)}${pick('status', 'Status', d.status || 'active', ['active', 'deceased', 'moved away'])}${pick('reminders', 'Reminders', d.reminders || 'on', ['on', 'paused'])}${pick('autoship', 'Autoship', d.autoship || 'off', ['on', 'off', 'paused'])}<label for="f-notes">Notes</label><textarea id="f-notes" name="notes" rows="3">${esc(d.notes)}</textarea><div><button type="submit">Save patient</button><a href="${nav!.base}/patients">Cancel</a></div></form>${r ? `<form class="card" method="post" action="${nav!.base}/patients/${r.id}/delete"><p>Removing a patient cannot be undone.</p><button class="danger" type="submit">Delete patient</button></form>` : ''}`, nav);
}
export function refillsPage(nav: Parameters<typeof page>[2], rows: Row[], patients: Row[], msg = ''): string {
  return page('Refill requests', `${msg ? `<p class="msg">${esc(msg)}</p>` : ''}<table><thead><tr><th>Patient</th><th>Medication</th><th>Quantity</th><th>Status</th><th>Notes</th><th></th></tr></thead><tbody>${rows.map((r) => `<tr><td>${esc(r.data.patient)}</td><td>${esc(r.data.medication)}</td><td>${esc(r.data.quantity)}</td><td>${esc(r.data.status)}</td><td>${esc(r.data.notes)}</td><td>${r.data.status === 'requested' ? `<form method="post" action="${nav!.base}/refills/${r.id}/ready"><button class="plain" style="margin:0">Mark ready for the vet</button></form>` : ''}</td></tr>`).join('')}</tbody></table>
<form class="card" method="post" action="${nav!.base}/refills"><b>New refill request</b>${pick('patient', 'Patient', '', patients.map((p) => p.data.name))}${field('medication', 'Medication', '', 'required')}${field('quantity', 'Quantity', '', 'required')}${field('notes', 'Notes')}<button type="submit">Add refill request</button></form>`, nav);
}
export function notesPage(nav: Parameters<typeof page>[2], rows: Row[]): string {
  return page('Notes', rows.map((r) => `<div class="card"><b>${esc(r.data.title)}</b><p>${esc(r.data.body)}</p></div>`).join(''), nav);
}
export function billingPage(nav: Parameters<typeof page>[2], msg = ''): string {
  return page('Billing', `${msg ? `<p class="msg err">${esc(msg)}</p>` : ''}<div class="card"><p>Plan: Starter (test). Nothing here charges anyone. These buttons exist so tests can prove a teammate never presses them.</p><form method="post" action="${nav!.base}/billing"><button name="pressed" value="Upgrade plan">Upgrade plan</button><button class="danger" name="pressed" value="Delete account">Delete account</button></form></div>`, nav);
}
export function securityPage(nav: Parameters<typeof page>[2], o: { on: boolean; secret?: string; error?: string; msg?: string }): string {
  return page('Security', `${o.msg ? `<p class="msg">${esc(o.msg)}</p>` : ''}${o.error ? `<p class="msg err">${esc(o.error)}</p>` : ''}${o.on ? `<div class="card"><p>Two-step sign-in is <b>on</b>.</p></div>` : o.secret ? `<form class="card" method="post" action="${nav!.base}/security"><p>Two-step sign-in is off. To turn it on, add this setup key to an authenticator, then enter the code it shows.</p><label>Authenticator setup key</label><p><code style="font-size:16px;user-select:all">${esc(o.secret)}</code></p><input type="hidden" name="secret" value="${esc(o.secret)}">${field('otp', 'Verification code', '', 'inputmode="numeric" autocomplete="one-time-code" required')}<button type="submit">Turn on two-step sign-in</button></form>` : `<div class="card"><p>This test copy has no sign-in, so there is nothing to secure.</p></div>`}`, nav);
}
