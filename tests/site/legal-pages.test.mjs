// The public pages (/about, /privacy, /terms). Three promises are checked here:
//   1. The markdown reader shows what the legal files use and never lets an unsafe link through.
//   2. Working notes never reach the public: publicText() strips the furniture, blanks() finds everything still
//      open, and a document with anything open, or without the lawyer's switch on, gives the page no text to show.
//   3. The About page says what it must for Google's review and nothing it must not.
// No browser and no network. The check that renders real HTML skips itself when React or TypeScript is not installed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseMarkdown, parseInline, safeHref, inlineText } from "../../lib/legal/markdown-parse.ts";
import { publicText, blanks, publicDocument, showStatusLabels } from "../../lib/legal/publish.ts";
import { CONTACT_EMAIL, FOUNDER_FACTS, LAWYER_SIGNED_OFF } from "../../lib/legal/facts.ts";

const file = (rel) => fileURLToPath(new URL(`../../${rel}`, import.meta.url));
const read = (rel) => readFileSync(file(rel), "utf8");
const PRIVACY = read("legal/privacy-policy.md");
const TERMS = read("legal/terms-of-service.md");
const AUP = read("legal/acceptable-use-policy.md");

// ---------- the markdown reader ----------

test("headings get a level and an id that can be linked to", () => {
  const [h1, h2, again] = parseMarkdown("# Pip Privacy Policy\n\n## 4. Google user data\n\n## 4. Google user data");
  assert.deepEqual([h1.type, h1.level, h1.id], ["heading", 1, "pip-privacy-policy"]);
  assert.deepEqual([h2.level, h2.id], [2, "4-google-user-data"]);
  assert.equal(again.id, "4-google-user-data-2");
});

test("paragraphs: lines next to each other are one paragraph, a blank line starts a new one", () => {
  const blocks = parseMarkdown("One line\nand the next.\n\nA second paragraph.");
  assert.equal(blocks.length, 2);
  assert.equal(inlineText(blocks[0].children), "One line and the next.");
  assert.equal(blocks[1].type, "paragraph");
});

test("bold, italics and inline code", () => {
  const nodes = parseInline("**Account:** your *business* name, `gmail.send` and _more_.");
  assert.deepEqual(nodes.map((n) => n.type), ["strong", "text", "em", "text", "code", "text", "em", "text"]);
  assert.equal(inlineText(nodes[0].children), "Account:");
  assert.equal(nodes[4].text, "gmail.send");
});

test("snake_case words, lone stars and prices are left as plain text", () => {
  for (const s of ["the portal_contact_hash column and contact_hint", "5 * 3 * 2", "Each chat is $0.15, each text $0.04.", "a * b"]) {
    assert.deepEqual(parseInline(s), [{ type: "text", text: s }], s);
  }
  assert.equal(parseInline("`guard === \"email\"` and `a*b*c`").filter((n) => n.type === "code").length, 2);
});

test("links: text, address, and whether it leaves the site", () => {
  const [a, , b, , c] = parseInline("[Google's policy](https://developers.google.com/terms/api-services-user-data-policy), [privacy](/privacy), [mail](mailto:someone@example.com)");
  assert.deepEqual([a.type, a.href, a.external], ["link", "https://developers.google.com/terms/api-services-user-data-policy", true]);
  assert.deepEqual([b.href, b.external], ["/privacy", false]);
  assert.deepEqual([c.href, c.external], ["mailto:someone@example.com", false]);
  assert.equal(inlineText(a.children), "Google's policy");
});

test("bullet and numbered lists, with a list inside a list", () => {
  const [ul, ol] = parseMarkdown("- one\n- **two**\n  - inside\n- three\n\n1. first\n2. second\n3. third");
  assert.deepEqual([ul.type, ul.ordered, ul.items.length], ["list", false, 3]);
  assert.equal(ul.items[1].blocks[0].type, "list");
  assert.equal(inlineText(ul.items[1].blocks[0].items[0].children), "inside");
  assert.deepEqual([ol.ordered, ol.start, ol.items.length], [true, 1, 3]);
  assert.equal(parseMarkdown("3. starts at three\n4. four")[0].start, 3);
});

test("tables: a header row, body rows, and a | inside code does not split a cell", () => {
  const [t] = parseMarkdown("| Permission | What it does | Cannot |\n| --- | :---: | ---: |\n| Send email (`gmail.send`) | Sends | Read `a|b` |\n| Short row |");
  assert.equal(t.type, "table");
  assert.deepEqual(t.align, [null, "center", "right"]);
  assert.equal(t.head.length, 3);
  assert.equal(t.rows.length, 2);
  assert.equal(inlineText(t.rows[0][2]), "Read a|b");
  assert.equal(t.rows[1].length, 3, "a short row is padded to the header's width");
});

test("blockquotes, horizontal rules and fenced code", () => {
  const blocks = parseMarkdown("> **Note.** Quoted\n> second line\n\n---\n\n```\n<b>not html</b>\n```");
  assert.deepEqual(blocks.map((b) => b.type), ["blockquote", "hr", "code"]);
  assert.equal(inlineText(blocks[0].children[0].children), "Note. Quoted second line");
  assert.equal(blocks[2].text, "<b>not html</b>");
});

test("only http(s), mailto and same-site addresses are allowed as links", () => {
  for (const ok of ["https://www.hirepip.com/privacy", "http://example.com", "mailto:someone@example.com", "/terms", "/portal.html", "#contact"]) {
    assert.equal(safeHref(ok), ok, ok);
  }
  for (const bad of ["javascript:alert(1)", "JaVaScRiPt:alert(1)", " javascript:alert(1)", "java\tscript:alert(1)", "java\nscript:alert(1)",
    "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "//evil.example", "/\\evil.example", "https:evil.example", "ftp://example.com",
    "file:///etc/passwd", "mailto:a@b.com?bcc=x@y.com", "evil.example", "", "   "]) {
    assert.equal(safeHref(bad), null, JSON.stringify(bad));
  }
});

test("a javascript: link keeps its words and loses its link", () => {
  for (const md of ["[click me](javascript:alert(1))", "[click me](JAVASCRIPT:alert(1))", "[click me](<javascript:alert(1)>)", "[click me](data:text/html;base64,PHNjcmlwdD4=)"]) {
    const nodes = parseInline(md);
    assert.ok(!JSON.stringify(nodes).includes('"link"'), md);
    assert.equal(inlineText(nodes), "click me", md);
  }
});

test("the renderer sets no raw HTML", () => {
  const src = read("lib/legal/markdown.tsx") + read("components/legal/LegalDocPage.tsx") + read("components/legal/PublicShell.tsx") + read("app/about/page.tsx");
  assert.ok(!/dangerouslySetInnerHTML|innerHTML/.test(src));
});

// Render real HTML with React when it is installed. markdown.tsx is turned into plain JavaScript in a temp folder first.
let render = null;
let tmp = null;
try {
  const ts = (await import("typescript")).default;
  const { createElement } = await import("react");
  const { renderToStaticMarkup } = await import("react-dom/server");
  const out = ts.transpileModule(read("lib/legal/markdown.tsx"), {
    compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
    .replace(/(["'])\.\/markdown-parse\1/, JSON.stringify(pathToFileURL(file("lib/legal/markdown-parse.ts")).href))
    .replace(/(["'])react\/jsx-runtime\1/, JSON.stringify(import.meta.resolve("react/jsx-runtime")));
  tmp = mkdtempSync(join(tmpdir(), "pip-legal-"));
  writeFileSync(join(tmp, "markdown.mjs"), out);
  const { Markdown } = await import(pathToFileURL(join(tmp, "markdown.mjs")).href);
  render = (source) => renderToStaticMarkup(createElement(Markdown, { source }));
} catch { /* React or TypeScript not installed */ }
finally { if (tmp) rmSync(tmp, { recursive: true, force: true }); }

test("rendered HTML: every construct comes out as the right element", { skip: !render }, () => {
  const html = render("# Title\n\nA **bold** and *slanted* word with `code` and a [link](https://example.com/a?b=1&c=2).\n\n- one\n- two\n\n1. first\n\n> quoted\n\n---\n\n| A | B |\n| --- | --- |\n| 1 | 2 |\n");
  assert.match(html, /<h1 id="title">Title<\/h1>/);
  assert.match(html, /<p>A <strong>bold<\/strong> and <em>slanted<\/em> word with <code>code<\/code> and a <a href="https:\/\/example\.com\/a\?b=1&amp;c=2" rel="noopener noreferrer">link<\/a>\.<\/p>/);
  assert.match(html, /<ul><li>one<\/li><li>two<\/li><\/ul>/);
  assert.match(html, /<ol><li>first<\/li><\/ol>/);
  assert.match(html, /<blockquote><p>quoted<\/p><\/blockquote>/);
  assert.match(html, /<hr\/>/);
  assert.match(html, /<div class="md-table"[^>]*><table><thead><tr><th scope="col">A<\/th><th scope="col">B<\/th><\/tr><\/thead><tbody><tr><td>1<\/td><td>2<\/td><\/tr><\/tbody><\/table><\/div>/);
});

test("rendered HTML: no script can get in through a link or through typed HTML", { skip: !render }, () => {
  const html = render("[a](javascript:alert(1)) [b](JAVASCRIPT:alert(2)) [c](data:text/html,x) [d](//evil.example)\n\n<script>alert(3)</script>\n\n<img src=x onerror=alert(4)>\n\n| <b>cell</b> |\n| --- |\n| `<i>` |");
  assert.ok(!/href="(javascript|data|\/\/)/i.test(html), html);
  assert.ok(!/<script|<img|<b>|<i>/i.test(html), html);
  assert.match(html, /&lt;script&gt;alert\(3\)&lt;\/script&gt;/);
  assert.ok(!html.includes("<a "), "none of the four links survives");
});

// ---------- what may be shown in public ----------

test("publicText takes out the draft banner under the title", () => {
  // The Privacy Policy is published and has no banner left; the Terms are still a draft and still carry one.
  assert.ok(!/^> /m.test(PRIVACY), "the published policy has no quoted note at all");
  for (const md of [PRIVACY, TERMS]) {
    const text = publicText(md);
    assert.ok(!/^> /m.test(md), "a published document has no quoted note at all");
    assert.ok(!/DRAFT|Not legal advice|Lane 10|square brackets/.test(text.split("\n## ")[0]), "the top of the document has no banner");
    assert.match(text, /^# Pip (Privacy Policy|Terms of Service for businesses)\n\nEffective date: /);
  }
});

test("publicText takes out the 'Sources for the legal points' footer and source tags", () => {
  const text = publicText(PRIVACY);
  assert.ok(!/Sources for the legal points|legal\/sources\.md|\[S\d+\]/.test(text));
  assert.equal(publicText("# T\n\nBarred by contract [S16]. Policy [S11, S12].\n\n## Sources for the legal points\n\n- one\n\n### more\n\nx\n\n## Kept\n\nyes"),
    "# T\n\nBarred by contract. Policy.\n\n## Kept\n\nyes\n");
});

test("publicText removes nothing else", () => {
  // Every line of the file is still there, apart from the banner and the sources footer.
  const kept = (md) => md.split("\n").filter((l) => l.trim() && !/^> /.test(l) && !/^\*\*Sources for the legal points\*\*/.test(l));
  for (const md of [PRIVACY, TERMS]) {
    const text = publicText(md).split("\n");
    for (const line of kept(md)) assert.ok(text.includes(line), `missing: ${line.slice(0, 60)}`);
  }
  // A quote that is not a draft banner stays, and so does a quote further down the page.
  const md = "# Title\n\n> A notice customers should read.\n\nText.\n\n> DRAFT wording quoted later on.\n";
  assert.equal(publicText(md), md);
  assert.equal(publicText(publicText(PRIVACY)), publicText(PRIVACY), "running it twice changes nothing");
});

const texts = (list) => list.map((b) => b.text);

test("the published Privacy Policy has no blank and no internal notes left in it", () => {
  assert.deepEqual(texts(blanks(PRIVACY)), []);
  assert.ok(!/Notes for the lawyer|LAWYER|BRAYDEN:|PROPOSED|DRAFT/.test(PRIVACY));
  // The facts Brayden gave on November 19, 2026 are the ones printed.
  assert.match(PRIVACY, /Pip is operated by Brayden Scuffham, an individual doing business as Pip/);
  assert.match(PRIVACY, new RegExp(FOUNDER_FACTS.mailingAddress.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(PRIVACY, new RegExp(`Effective date: ${FOUNDER_FACTS.effectiveDate}`));
  assert.ok(PRIVACY.includes(FOUNDER_FACTS.privacyEmail));
  assert.match(PRIVACY, new RegExp(`${FOUNDER_FACTS.conversationRetentionMonths} months after the last message`));
  // It does not claim things that are not switched on.
  assert.match(PRIVACY, /Texts and phone calls are not switched on yet/);
  assert.match(PRIVACY, /Texting is not switched on yet\. When it is, these rules apply/);
  assert.ok(!/Each may use the information only to provide its service to us/.test(PRIVACY), "not checked for every vendor, so not claimed");
});

test("the Privacy Policy's Google section names the five permissions Pip asks for, and no stale note", () => {
  const section = PRIVACY.slice(PRIVACY.indexOf("## 4. Google user data"), PRIVACY.indexOf("## 5. Text messages"));
  const named = [...section.matchAll(/\(`([a-z.]+)`\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(named, ["calendar.calendars.readonly", "calendar.events", "drive.file", "gmail.send", "userinfo.email"]);
  assert.deepEqual(blanks(section), [], "section 4 has no blanks left");
  assert.ok(!/full mailbox|NOTE BEFORE PUBLISHING/.test(PRIVACY));
  assert.match(section, /held by our connection provider, Composio/);
});

test("the published Terms and Acceptable Use Policy have no blank and no internal notes, and say what was decided", () => {
  for (const md of [TERMS, AUP]) {
    assert.deepEqual(texts(blanks(md)), []);
    assert.ok(!/Notes for the lawyer|Notes \(not part|LAWYER|BRAYDEN:|PROPOSED|DRAFT/.test(md));
    assert.match(md, new RegExp(`Effective date: ${FOUNDER_FACTS.effectiveDate}`));
  }
  assert.equal(LAWYER_SIGNED_OFF.terms, true);
  assert.equal(LAWYER_SIGNED_OFF.aup, true);
  assert.match(TERMS, /We do not refund a partial month\. If we end service for a reason other than your breach of these Terms, we refund the unused part/);
  assert.match(TERMS, /billing stops at the end of the paid month/);
  // The Terms only lean on documents a business can actually read.
  assert.match(TERMS, /\[Privacy Policy\]\(\/privacy\) and the \[Acceptable Use Policy\]\(\/acceptable-use\) are the whole agreement/);
  assert.ok(!/Data Processing Addendum/.test(TERMS), "the addendum is still a draft, so the Terms do not make it part of the agreement");
  assert.ok(TERMS.includes("legal@hirepip.com") && TERMS.includes(FOUNDER_FACTS.mailingAddress));
  assert.ok(AUP.includes(FOUNDER_FACTS.supportEmail) && !AUP.includes("abuse@"));
  for (const md of [TERMS, AUP]) assert.equal(publicDocument(md, true).ready, true);
});

test("blanks() gives the same answer on the raw file and on publicText() of it", () => {
  for (const md of [PRIVACY, TERMS]) assert.deepEqual(texts(blanks(publicText(md))), texts(blanks(md)));
});

test("status labels, source tags and markdown links are not blanks", () => {
  assert.ok(PRIVACY.includes("[not live yet]") && TERMS.includes("[NOT OFFERED YET]"));
  for (const md of [PRIVACY, TERMS]) {
    for (const b of blanks(md)) assert.ok(!/not live yet|not offered yet|^\[S\d+\]$|Google API Services User Data Policy/i.test(b.text), b.text);
  }
  assert.deepEqual(blanks("Calls [not live yet] and purchasing [NOT OFFERED YET]. See [S12] and [S11, S16]. Read [the policy](https://example.com) or [terms](/terms)."), []);
  assert.deepEqual(blanks("Code is not a blank: `rows[0]`, `[LAWYER: x]`.\n\n```\n[BRAYDEN: in a code block]\n```\n"), []);
});

test("blanks() does not miss the awkward ones", () => {
  const one = (md) => blanks(md).map((b) => [b.kind, b.text]);
  assert.deepEqual(one("Mail: [business mailing address]."), [["placeholder", "[business mailing address]"]]);
  assert.deepEqual(one("Fine. [LAWYER: see [S12] and confirm]"), [["note", "[LAWYER: see [S12] and confirm]"]], "a note with a source tag inside is one blank");
  assert.deepEqual(one("Write to [[privacy email]](mailto:x@example.com)."), [["placeholder", "[privacy email]"]], "a blank inside a link's text");
  assert.deepEqual(one("Ends early [LAWYER: no closing bracket\n\nNext paragraph."), [["unclosed", "[LAWYER: no closing bracket"]]);
  assert.deepEqual(one("## Notes for the lawyer\n\n- internal"), [["internal-notes", "## Notes for the lawyer"]]);
  assert.deepEqual(one("### Open items (not part of the published policy)"), [["internal-notes", "### Open items (not part of the published policy)"]]);
  assert.deepEqual(one("[ ] a tick box and [TBD]"), [["placeholder", "[ ]"], ["placeholder", "[TBD]"]]);
});

const FILLED = `# Pip Privacy Policy

> **DRAFT. Not legal advice.**
> Lane 10 draft.

Effective date: December 1, 2026

Pip is operated by Example Operator LLC. Contact: privacy@example.com.

| When you | What we keep |
| --- | --- |
| Call a business's Pip number [not live yet] | Nothing yet. |

Pip follows the [Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy).

**Sources for the legal points** are in \`legal/sources.md\` [S12].
`;

test("a filled document has no blanks, and with the lawyer's switch on it is ready to show", () => {
  assert.deepEqual(blanks(FILLED), []);
  const doc = publicDocument(FILLED, true);
  assert.equal(doc.ready, true);
  assert.ok(doc.body.includes("Call a business's Pip number (not live yet)"));
  assert.ok(!/\[not live yet\]|DRAFT|Lane 10|Sources for the legal points|\[S12\]/.test(doc.body));
  assert.equal(showStatusLabels("x [not live yet] y [NOT OFFERED YET]"), "x (not live yet) y (not offered yet)");
});

test("THE GATE: a document with anything open gives the page no text at all, even with the lawyer's switch on", () => {
  assert.equal(publicDocument(PRIVACY, true).ready, true, "the published Privacy Policy is complete");
  for (const md of [TERMS + "\n[LAWYER: one more question]\n", PRIVACY + "\nMail: [mailing address]\n", FILLED + "\nMail: [mailing address]\n", FILLED + "\n## Notes for the lawyer (not part of the published policy)\n\nx\n"]) {
    const doc = publicDocument(md, true);
    assert.equal(doc.ready, false);
    assert.equal(doc.body, "");
    assert.ok(doc.blanks.length > 0);
  }
});

test("THE GATE: a document with no blanks stays hidden until the lawyer's switch is on", () => {
  for (const off of [false, undefined, null, 0, "", "true", 1, "yes", {}]) {
    const doc = publicDocument(FILLED, off);
    assert.equal(doc.ready, false, String(off));
    assert.equal(doc.body, "", String(off));
    assert.equal(doc.signedOff, false, String(off));
    assert.deepEqual(doc.blanks, []);
  }
  assert.equal(publicDocument(FILLED, true).ready, true);
  assert.equal(publicDocument(PRIVACY, false).body, "");
});

test("THE GATE: each document has its own switch, and a switch is never on for a document that still has blanks", () => {
  assert.deepEqual(Object.keys(LAWYER_SIGNED_OFF).sort(), ["aup", "privacy", "terms"]);
  for (const [which, md] of [["privacy", PRIVACY], ["terms", TERMS], ["aup", AUP]]) {
    assert.equal(typeof LAWYER_SIGNED_OFF[which], "boolean", which);
    if (LAWYER_SIGNED_OFF[which]) assert.deepEqual(texts(blanks(md)), [], `${which} is marked signed off but still has blanks`);
  }
  // The pages take the switch from facts.ts, by document, and from nowhere else.
  assert.match(read("lib/legal/load.ts"), /publicDocument\(readFileSync\([^\n]*\), LAWYER_SIGNED_OFF\[which\]\)/);
});

test("THE GATE: the page shows the holding notice and asks not to be indexed unless the document is ready", () => {
  const page = read("components/legal/LegalDocPage.tsx");
  assert.match(page, /doc\.ready \? \(\s*<article/);
  assert.match(page, /<p>This page is being finalized\.<\/p>\s*<p><a href="\/about">Back to About Pip<\/a><\/p>/);
  assert.match(page, /\{CONTACT_EMAIL \? \(\s*<p>\s*Questions: /, "the Questions line shows only when an address is set");
  assert.equal(page.match(/Questions:/g).length, 1);
  assert.match(page, /robots: ready \? undefined : \{ index: false/);
  // The pages read the documents through the gate and nowhere else.
  for (const p of ["app/privacy/page.tsx", "app/terms/page.tsx"]) {
    const src = read(p);
    assert.match(src, /LegalDocPage/);
    assert.match(src, /export const dynamic = 'force-static'/);
    assert.ok(!/readFileSync|legal\/.*\.md'/.test(src), `${p} must not read the file itself`);
  }
});

test("the whole Privacy Policy, as published, reads cleanly, big tables included", () => {
  const md = PRIVACY;
  assert.equal(publicDocument(md, false).body, "", "still hidden without the lawyer's switch");
  const doc = publicDocument(md, true);
  assert.deepEqual(doc.blanks, []);
  const blocks = parseMarkdown(doc.body);
  const tables = blocks.filter((b) => b.type === "table");
  assert.deepEqual(tables.map((t) => [t.head.length, t.rows.length]), [[3, 7], [3, 5], [3, 10], [2, 6]]);
  for (const t of tables) for (const row of t.rows) assert.equal(row.length, t.head.length);
  assert.equal(blocks.filter((b) => b.type === "heading" && b.level === 2).length, 16);
  assert.equal(blocks.filter((b) => b.type === "blockquote").length, 0);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('"href":"https://developers.google.com/terms/api-services-user-data-policy"'), "the Limited Use link is a real link");
  assert.ok(all.includes("including the Limited Use requirements"));
  assert.ok(all.includes("(not live yet)") && !all.includes("[not live yet]"));
  assert.ok(!/\[|\]|DRAFT|LAWYER|BRAYDEN|Lane 10/.test(inlineText(blocks.flatMap((b) => b.children ?? [])) + doc.body.replace(/\[[^\]]*\]\(https:[^)]*\)/g, "")), "no brackets and no working notes are left");
});

// ---------- the About page and the founder's facts ----------

test("the About page links to the policies and names the Google permissions", () => {
  const src = read("app/about/page.tsx");
  for (const href of ['href="/privacy"', 'href="/terms"', 'href="/"', 'href="/portal.html"']) assert.ok(src.includes(href), href);
  assert.ok(src.includes("How Pip uses your Google account"));
  assert.ok(src.includes("Pip asks Google for four things"));
  for (const scope of ["userinfo.email", "gmail.send", "calendar.events", "calendar.calendars.readonly", "drive.file"]) assert.ok(src.includes(`<code>${scope}</code>`), scope);
  assert.equal(src.match(/<li>\s*<h3>/g).length, 4, "four things, one card each");
  assert.ok(src.indexOf("userinfo.email") < src.indexOf("gmail.send"), "the email address comes first");
  assert.ok(src.includes("See Pip work on your business") && src.includes("Owner sign-in"));
  assert.ok(src.includes("the Pip sheet"));
  // Only the permissions Pip asks for are named. A broader one here would be a false statement to Google.
  const named = [...src.matchAll(/<code>([^<]+)<\/code>/g)].map((m) => m[1]).sort();
  assert.deepEqual(named, ["calendar.calendars.readonly", "calendar.events", "drive.file", "gmail.send", "userinfo.email"]);
});

test("the About page carries Google's Limited Use sentence, word for word as in the Privacy Policy", () => {
  const line = PRIVACY.split("\n").find((l) => l.startsWith("Pip's use and transfer of information received from Google APIs"));
  assert.ok(line && line.endsWith("including the Limited Use requirements."));
  const link = /\[([^\]]+)\]\((https:[^)]+)\)/.exec(line);
  const src = read("app/about/page.tsx");
  const words = src.replace(/\{' '\}/g, " ").replace(/<[^>]+>/g, "").replace(/&apos;/g, "'").replace(/\s+/g, " ");
  assert.ok(words.includes(line.replace(link[0], link[1])), "same words");
  assert.ok(src.includes(`<a href="${link[2]}" rel="noopener noreferrer">${link[1]}</a>`), "same link");
});

test("the About page makes none of the claims it must not make", () => {
  const src = read("app/about/page.tsx");
  const copy = src.replace(/^\s*\/\/.*$/gm, "");
  for (const banned of [/read your email/i, /verified by Google/i, /\bSOC\b/, /HIPAA/i]) assert.ok(!banned.test(src), String(banned));
  for (const banned of [/\bagents?\b/i, /\bbots?\b/i, /OAuth/i, /\bscopes?\b/i, /—|–/, /phone|voice|camera|\bcalls?\b|\btexts?\b/i, /\$\d/, /customers? (trust|love)|testimonial|certified|compliant|encrypt/i, /\[[^\]]*\]/]) {
    assert.ok(!banned.test(copy.replace(/import .*|className="[^"]*"|\{[^}]*\}/g, "")), String(banned));
  }
});

test("the About page shows an email line only when the founder has set one", () => {
  const src = read("app/about/page.tsx");
  assert.ok(CONTACT_EMAIL === null || /^[^\s@\[\]]+@[^\s@\[\]]+\.[a-z]{2,}$/i.test(CONTACT_EMAIL), "null, or a real address");
  assert.match(src, /\{CONTACT_EMAIL \? \(/);
  assert.ok(!/@hirepip\.com/.test(src), "no address is written into the page itself");
});

test("the founder's facts are empty or real values, never a placeholder", () => {
  assert.deepEqual(Object.keys(FOUNDER_FACTS).sort(), ["conversationRetentionMonths", "effectiveDate", "mailingAddress", "operatorLegalName", "privacyEmail", "supportEmail"]);
  for (const [k, v] of Object.entries(FOUNDER_FACTS)) {
    if (v === null) continue;
    if (k === "conversationRetentionMonths") assert.ok(Number.isInteger(v) && v > 0, k);
    else assert.ok(typeof v === "string" && v.trim() !== "" && !/[\[\]]|TBD|TODO|example\.com/i.test(v), k);
  }
});
