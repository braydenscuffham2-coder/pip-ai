import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { Mood } from '@/components/Pip';
import { BrainError, demoTurn, saveLead, wishSkill, type ManualInput } from './brain';
import type { Brief, Skill, Understanding } from './types';

export interface FeedLine { icon: string; text: string; sub?: string }

const Eyebrow = ({ children }: { children: React.ReactNode }) => <p className="sl-eye">{children}</p>;
const firstName = (n: string) => n.trim().split(/\s+/)[0] || n;

/* ---------------- Hello ---------------- */
export function IntroSlide({ onSite, onManual, onExample }: { onSite: (s: string) => void; onManual: (m: ManualInput) => void; onExample: () => void }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const [manual, setManual] = useState(false);
  const [m, setM] = useState<ManualInput>({ name: '', what: '', town: '', reviews: '' });
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').split(/[/?#]/)[0];
    if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(v)) { setErr('Enter a website like yourbusiness.com'); return; }
    onSite(v);
  };
  return (
    <div className="sl sl-intro">
      <div className="hero-orb" aria-hidden="true"><span /><span /><span /></div>
      <h1 className="sl-h1">An AI consultant that <span className="grad-text">studies your business</span> first.</h1>
      <p className="sl-lede">Pip reads your website, your Google reviews and your competition, then designs AI built only for you.</p>
      {!manual ? (
        <>
          <form className="url-row" onSubmit={submit} noValidate>
            <label className="sr-only" htmlFor="site-in">Website</label>
            <input id="site-in" value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} placeholder="yourbusiness.com" inputMode="url" autoCapitalize="off" spellCheck={false} aria-invalid={!!err} aria-describedby={err ? 'site-err' : undefined} />
            <button className="dk-btn big" type="submit">Study my business →</button>
          </form>
          {err && <p className="form-err" id="site-err">{err}</p>}
          <div className="intro-alt">
            <button type="button" className="link-btn" onClick={onExample}>Watch Pip present a real plumber</button>
            <span aria-hidden="true">·</span>
            <button type="button" className="link-btn" onClick={() => setManual(true)}>No website? Tell Pip about it</button>
          </div>
        </>
      ) : (
        <form className="manual" onSubmit={e => { e.preventDefault(); if (m.name.trim() && m.what.trim()) onManual(m); }}>
          <div className="mf"><label htmlFor="m-name">Business name</label><input id="m-name" value={m.name} onChange={e => setM({ ...m, name: e.target.value })} required maxLength={80} /></div>
          <div className="mf"><label htmlFor="m-town">Town or area</label><input id="m-town" value={m.town} onChange={e => setM({ ...m, town: e.target.value })} maxLength={80} /></div>
          <div className="mf wide"><label htmlFor="m-what">What you do and who for</label><textarea id="m-what" rows={3} value={m.what} onChange={e => setM({ ...m, what: e.target.value })} required maxLength={800} placeholder="Family dental office. Cleanings, fillings, kids' dentistry. Most patients are local families." /></div>
          <div className="mf wide"><label htmlFor="m-rev">Paste a few reviews <em>(optional)</em></label><textarea id="m-rev" rows={3} value={m.reviews} onChange={e => setM({ ...m, reviews: e.target.value })} maxLength={4000} placeholder="One review per paragraph" /></div>
          <div className="mf-row"><button className="dk-btn" type="submit" disabled={!m.name.trim() || !m.what.trim()}>Study my business →</button><button type="button" className="link-btn" onClick={() => setManual(false)}>Use a website instead</button></div>
        </form>
      )}
    </div>
  );
}

/* ---------------- Scan ---------------- */
export function ScanSlide({ feed, thinking, domain }: { feed: FeedLine[]; thinking: { label: string; chars: number } | null; domain: string | null }) {
  const end = useRef<HTMLLIElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, [feed.length, !!thinking]);
  return (
    <div className="sl sl-scan">
      <Eyebrow>{domain ? `Studying ${domain}` : 'Studying your business'}</Eyebrow>
      <h2 className="sl-h2">{thinking ? 'Thinking it through' : 'Gathering the facts'}</h2>
      <ul className="pfeed">
        {feed.map((l, i) => (
          <li key={i} className="pop"><span className="f-ico"><Icon name={l.icon} /></span><span><b>{l.text}</b>{l.sub && <em>{l.sub}</em>}</span></li>
        ))}
        {thinking && <li className="pop thinking" ref={end}><span className="f-ico"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></span><span><b>{thinking.label}</b><em>Reading every page and review, so this takes about a minute</em></span></li>}
        {!thinking && <li ref={end} aria-hidden="true" />}
      </ul>
    </div>
  );
}

/* ---------------- Your business ---------------- */
export function WhoSlide({ und, onCorrect, busy }: { und: Understanding; onCorrect: (note: string) => void; busy: boolean }) {
  const [fix, setFix] = useState(false);
  const [note, setNote] = useState('');
  return (
    <div className="sl sl-who">
      <Eyebrow>This is you</Eyebrow>
      <h2 className="sl-h1 tight">{und.name}</h2>
      <p className="sl-lede">{und.oneLiner}</p>
      {und.services.length > 0 && <ul className="pchips">{und.services.map(s => <li key={s}>{s}</li>)}</ul>}
      <div className="facts-grid">
        {und.customers && <div className="pfact wide"><span>Your customers</span><b>{und.customers}</b></div>}
        {und.area && <div className="pfact"><span>Area</span><b>{und.area}</b></div>}
        {und.hours && <div className="pfact"><span>Hours</span><b>{und.hours}</b></div>}
        {und.phone && <div className="pfact"><span>Phone</span><b className="num">{und.phone}</b></div>}
        {und.rating != null && <div className="pfact"><span>Google</span><b className="num">{und.rating.toFixed(1)}★ <em>· {und.reviewCount} reviews</em></b></div>}
      </div>
      {und.facts.length > 0 && (
        <div className="distinct"><span className="sl-eye">What makes you different</span><ul>{und.facts.map(f => <li key={f}>{f}</li>)}</ul></div>
      )}
      {!fix ? (
        <button type="button" className="link-btn fix" onClick={() => setFix(true)} disabled={busy}>Something's wrong or missing? Tell Pip</button>
      ) : (
        <form className="fix-row" onSubmit={e => { e.preventDefault(); if (note.trim()) { onCorrect(note.trim()); setFix(false); setNote(''); } }}>
          <label className="sr-only" htmlFor="fix-in">What should Pip know?</label>
          <input id="fix-in" autoFocus value={note} onChange={e => setNote(e.target.value)} placeholder="We also do commercial work, and we're closed Sundays" maxLength={400} />
          <button className="dk-btn" type="submit" disabled={!note.trim()}>Update</button>
        </form>
      )}
    </div>
  );
}

/* ---------------- Your AI today ---------------- */
export function AiSlide({ und }: { und: Understanding }) {
  const a = und.aiToday;
  const [n, setN] = useState(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(a.score); return; }
    const t0 = performance.now(); let raf = 0;
    const f = (now: number) => { const k = Math.min(1, (now - t0) / 1400); setN(Math.round(a.score * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => cancelAnimationFrame(raf);
  }, [a.score]);
  const KIND = { ai: 'AI', tool: 'Tool', manual: 'By hand' } as const;
  return (
    <div className="sl sl-ai">
      <Eyebrow>Your AI today</Eyebrow>
      <div className="ai-top">
        <div className="dial big" role="img" aria-label={`AI coverage ${a.score} out of 100`}>
          <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="track" cx="60" cy="60" r="52" /><circle className="val" cx="60" cy="60" r="52" style={{ strokeDashoffset: 326.73 * (1 - n / 100) }} /></svg>
          <div className="dial-n"><b>{n}</b><span>of 100</span></div>
        </div>
        <div><h2 className="sl-h2">{a.verdict}</h2><p className="sl-sub">How much of your customer journey runs on AI or automation today.</p></div>
      </div>
      <div className="ai-cols">
        <div>
          <span className="sl-eye">What you use now</span>
          <ul className="puses">{a.items.map(i => (
            <li key={i.name}><div className="u-head"><b>{i.name}</b><span className={`kind ${i.kind}`}>{KIND[i.kind]}</span></div>{i.does && <p className="ok">{i.does}</p>}{i.misses && <p className="lim">{i.misses}</p>}</li>
          ))}</ul>
        </div>
        <div>
          <span className="sl-eye">Biggest gaps</span>
          <ol className="pgaps">{a.gaps.map(g => <li key={g.area}><b>{g.area}</b><p>{g.detail}</p></li>)}</ol>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Customers ---------------- */
export function ReviewsSlide({ und }: { und: Understanding }) {
  const r = und.reviews;
  const max = Math.max(1, ...r.themes.map(t => t.count));
  return (
    <div className="sl sl-rev">
      <Eyebrow>What customers say</Eyebrow>
      <div className="prev-top">
        {und.rating != null && <div className="big-rate"><b className="num">{und.rating.toFixed(1)}</b><span className="pstars" aria-hidden="true">★★★★★</span><em>{und.reviewCount} Google reviews</em></div>}
        <p className="sl-lede">{r.summary || 'Here is what stands out in your reviews.'}</p>
      </div>
      {r.themes.length > 0 && (
        <>
          <p className="sl-sub">From the {r.sample} most recent reviews I could read.</p>
          <ul className="pthemes">{r.themes.map(t => (
            <li key={t.label} className={t.sentiment}>
              <div className="t-row"><b>{t.label}</b><span className="t-bar"><span style={{ width: `${(t.count / max) * 100}%` }} /></span><em className="num">{t.count}×</em></div>
              {t.quote && <q>{t.quote}</q>}
            </li>
          ))}</ul>
        </>
      )}
    </div>
  );
}

/* ---------------- Competition ---------------- */
export function RivalsSlide({ und }: { und: Understanding }) {
  const c = und.competition;
  return (
    <div className="sl sl-rivals">
      <Eyebrow>Your competition</Eyebrow>
      <p className="sl-lede">{c.summary || 'The businesses closest to you on Google.'}</p>
      <ul className="privals">
        <li className="me"><b>{und.name}</b><span className="num">{und.rating != null ? `${und.rating.toFixed(1)}★` : '—'}</span><em>You</em></li>
        {c.rivals.map(r => (
          <li key={r.name}><b>{r.name}</b><span className="num">{r.rating != null ? `${r.rating.toFixed(1)}★` : '—'}</span><em>{r.distanceMi != null ? `${r.distanceMi} mi` : ''}</em>{r.edge && <p>{r.edge}</p>}</li>
        ))}
      </ul>
    </div>
  );
}

/* ---------------- Upgrades ---------------- */
export function UpgradesSlide({ brief, skills, error, picked, onToggle, onCustom, onRetry, speak }: {
  brief: Brief; skills: Skill[] | null; error: string | null; picked: string[];
  onToggle: (id: string, name: string) => void; onCustom: (k: Skill) => void; onRetry: () => void; speak: (t: string, m?: Mood) => void;
}) {
  const [open, setOpen] = useState<Skill | null>(null);
  const [wish, setWish] = useState('');
  const [making, setMaking] = useState(false);
  const [wishErr, setWishErr] = useState('');
  async function create(e: React.FormEvent) {
    e.preventDefault();
    const w = wish.trim();
    if (!w || making) return;
    setMaking(true); setWishErr('');
    speak(`Designing that for ${brief.und.name}…`, 'think');
    try { const k = await wishSkill(w, brief); onCustom(k); setWish(''); setOpen(k); }
    catch (e2) { setWishErr((e2 as BrainError).code === 'rate_limited' ? 'Too many requests right now. Try again in a minute.' : "I couldn't design that one. Try describing it another way."); speak("That one didn't come together. Try describing it another way.", 'idle'); }
    finally { setMaking(false); }
  }
  if (open) return <SkillDetail skill={open} brief={brief} added={picked.includes(open.id)} onToggle={() => onToggle(open.id, open.name)} onClose={() => setOpen(null)} />;
  return (
    <div className="sl sl-up">
      <Eyebrow>Designed for {brief.und.name}</Eyebrow>
      <h2 className="sl-h2">Your upgrades</h2>
      <form className="wish" onSubmit={create}>
        <label htmlFor="wish-in"><Icon name="chip" /> Create anything</label>
        <div className="wish-row">
          <input id="wish-in" value={wish} onChange={e => setWish(e.target.value)} placeholder="Describe anything you wish your business could do…" maxLength={400} disabled={making} />
          <button className="dk-btn" type="submit" disabled={!wish.trim() || making}>{making ? 'Designing…' : 'Build it'}</button>
        </div>
        {wishErr && <p className="form-err">{wishErr}</p>}
      </form>
      {error && <div className="err-box"><p>{error}</p><button type="button" className="dk-btn" onClick={onRetry}>Try again</button></div>}
      <div className="sk-grid">
        {!skills && !error && Array.from({ length: 6 }).map((_, i) => <div key={i} className="pk ghost" style={{ ['--i' as string]: i }}><span /><span /><span /></div>)}
        {skills?.map((k, i) => {
          const on = picked.includes(k.id);
          return (
            <article key={k.id} className={`pk${on ? ' on' : ''}${k.custom ? ' custom' : ''}`} style={{ ['--i' as string]: i }}>
              <button type="button" className="sk-open" onClick={() => setOpen(k)} aria-label={`Open ${k.name}`} />
              <div className="sk-top"><span className="sk-ico"><Icon name={k.icon} /></span><span className="sk-cat">{k.custom ? 'Made for you' : k.category}</span><span className="sk-match num">{k.match}%</span></div>
              <h3>{k.name}</h3>
              <p className="sk-tag">{k.tagline}</p>
              {k.why && <p className="sk-why">{k.why}</p>}
              <div className="sk-bot">
                <span className="sk-eff">{k.effort}</span>
                <button type="button" className={`sk-add${on ? ' on' : ''}`} onClick={() => onToggle(k.id, k.name)} aria-pressed={on}>{on ? '✓ Added' : '+ Add'}</button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function SkillDetail({ skill: k, brief, added, onToggle, onClose }: { skill: Skill; brief: Brief; added: boolean; onToggle: () => void; onClose: () => void }) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  const SRC = { review: 'Reviews', site: 'Your site', competitor: 'Competition', google: 'Google', owner: 'You asked' } as const;
  return (
    <div className="sl sl-detail">
      <button type="button" className="link-btn pback" onClick={onClose}>← All upgrades</button>
      <div className="d-cols">
        <div className="pd-info">
          <div className="sk-top"><span className="sk-ico"><Icon name={k.icon} /></span><span className="sk-cat">{k.custom ? 'Made for you' : k.category}</span><span className="sk-match num">{k.match}% match</span></div>
          <h2 className="sl-h2">{k.name}</h2>
          <p className="sl-lede">{k.tagline}</p>
          {k.evidence.length > 0 && <ul className="pevid">{k.evidence.map((e, i) => <li key={i}><span>{SRC[e.source]}</span>{e.text}</li>)}</ul>}
          <ol className="phow">{k.how.map((h, i) => <li key={i}>{h}</li>)}</ol>
          {k.impact && <p className="pk-impact"><b>What you get</b>{k.impact}</p>}
          <div className="d-meta">{k.connects.map(c => <span key={c} className="pill">Works with {c}</span>)}<span className="pill">{k.effort}</span></div>
          <button type="button" className={`dk-btn${added ? ' ghost' : ''}`} onClick={onToggle}>{added ? '✓ In your build · remove' : '+ Add to my build'}</button>
        </div>
        <div className="d-demo"><Demo skill={k} brief={brief} /></div>
      </div>
    </div>
  );
}

/* ---------------- demos ---------------- */
function Demo({ skill, brief }: { skill: Skill; brief: Brief }) {
  const d = skill.demo;
  if (d.kind === 'chat') return <LiveChat skill={skill} brief={brief} />;
  if (d.kind === 'flow') return (
    <div className="pdemo pflow"><p className="demo-cap">How it runs</p><ol>{d.steps.map((s, i) => <li key={i} style={{ ['--i' as string]: i }}><span className="at">{s.at}</span><span>{s.text}</span></li>)}</ol></div>
  );
  if (d.kind === 'message') return (
    <div className={`pdemo pmsg ${d.channel}`}><p className="demo-cap">{d.channel === 'email' ? 'Email it sends' : 'Text it sends'} · to {d.to}</p>
      <div className="msg-card">{d.subject && <b className="subj">{d.subject}</b>}<p>{d.body}</p><span className="from">from {brief.und.name}</span></div></div>
  );
  return (
    <div className="pdemo pbrief"><p className="demo-cap">{d.title}</p><div className="brief-card"><div className="br-head"><span className="logo-orb" aria-hidden="true" /><b>Good morning</b></div><ul>{d.lines.map((l, i) => <li key={i} style={{ ['--i' as string]: i }}>{l}</li>)}</ul></div></div>
  );
}

function LiveChat({ skill, brief }: { skill: Skill; brief: Brief }) {
  const opener = skill.demo.kind === 'chat' ? skill.demo.opener : '';
  const [msgs, setMsgs] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  async function send(text: string) {
    const t = text.trim().slice(0, 300);
    if (!t || busy) return;
    const h = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(h); setV(''); setBusy(true); setErr('');
    try { const r = await demoTurn(skill, brief, h); setMsgs([...h, { role: 'assistant', content: r || '…' }]); }
    catch (e) { setErr((e as BrainError).code === 'rate_limited' ? 'Too many messages right now. Try again in a minute.' : "That reply didn't come through. Send it again."); setMsgs(msgs); setV(t); }
    finally { setBusy(false); }
  }
  return (
    <div className="pdemo chat">
      <p className="demo-cap">Try it live · you're the customer</p>
      <div className="chat-feed" ref={feed}>
        {!msgs.length && <p className="chat-empty">Text {brief.und.name} anything. It answers with what I learned about the business.</p>}
        {msgs.map((m, i) => <p key={i} className={`bub ${m.role === 'user' ? 'me' : 'them'}`}>{m.content}</p>)}
        {busy && <p className="bub them"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="sr-only">Typing</span></p>}
      </div>
      {!msgs.length && opener && <button type="button" className="sug" onClick={() => void send(opener)}>{opener}</button>}
      {err && <p className="form-err">{err}</p>}
      <form className="chat-in" onSubmit={e => { e.preventDefault(); void send(v); }}>
        <label className="sr-only" htmlFor="chat-in">Message</label>
        <input id="chat-in" value={v} onChange={e => setV(e.target.value)} placeholder="Type as a customer…" maxLength={300} autoComplete="off" />
        <button type="submit" className="dk-btn" disabled={!v.trim() || busy}>Send</button>
      </form>
      {msgs.length > 0 && <button type="button" className="link-btn reset" onClick={() => { setMsgs([]); setErr(''); }}>Start over</button>}
    </div>
  );
}

/* ---------------- Build ---------------- */
export function BuildSlide({ brief, chosen, onRemove }: { brief: Brief; chosen: Skill[]; onRemove: (k: Skill) => void }) {
  return (
    <div className="sl sl-build">
      <Eyebrow>Your build</Eyebrow>
      <h2 className="sl-h2">{chosen.length ? `${chosen.length} AI ${chosen.length === 1 ? 'skill' : 'skills'} for ${brief.und.name}` : 'Nothing added yet'}</h2>
      {chosen.length > 0 && (
        <ol className="pplan">
          {chosen.map((k, i) => (
            <li key={k.id} style={{ ['--i' as string]: i }}>
              <span className="sk-ico"><Icon name={k.icon} /></span>
              <div><b>{k.name}</b><p>{k.impact || k.tagline}</p></div>
              <span className="pill">{k.effort}</span>
              <button type="button" className="x" onClick={() => onRemove(k)} aria-label={`Remove ${k.name}`}>×</button>
            </li>
          ))}
        </ol>
      )}
      <p className="sl-sub">Every build is checked by a person before it goes live. Anything risky waits for your OK.</p>
    </div>
  );
}

/* ---------------- Send ---------------- */
export function SendSlide({ brief, chosen, onSent }: { brief: Brief; chosen: Skill[]; onSent: (first: string) => void }) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim(), c = contact.trim();
    if (!n) { setErr('Add your name.'); return; }
    if (!(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) || c.replace(/\D/g, '').length >= 10)) { setErr('Add an email or a phone number with area code.'); return; }
    setBusy(true); setErr('');
    const ok = await saveLead({ name: n, contact: c, business: brief.und.name, site: brief.domain, skills: chosen.map(k => k.name) });
    setBusy(false);
    if (!ok) { setErr("That didn't save. Try again in a moment."); return; }
    setDone(firstName(n)); onSent(firstName(n));
  }
  if (done) return (
    <div className="sl sl-send is-done"><Eyebrow>Sent</Eyebrow><h2 className="sl-h1 tight">Talk soon, {done}.</h2><p className="sl-lede">A person on our team will look at {brief.und.name} and reach out within one business day with your build.</p></div>
  );
  return (
    <div className="sl sl-send">
      <Eyebrow>Last step</Eyebrow>
      <h2 className="sl-h2">Send me {brief.und.name}'s build</h2>
      <p className="sl-sub">{chosen.length ? chosen.map(k => k.name).join(' · ') : 'No skills picked yet. We will suggest a starting point.'}</p>
      <form className="send" onSubmit={submit} noValidate>
        <div className="mf"><label htmlFor="s-name">Your name</label><input id="s-name" value={name} onChange={e => setName(e.target.value)} autoComplete="name" maxLength={80} /></div>
        <div className="mf"><label htmlFor="s-contact">Email or phone</label><input id="s-contact" value={contact} onChange={e => setContact(e.target.value)} autoComplete="email" maxLength={120} /></div>
        {err && <p className="form-err">{err}</p>}
        <button className="dk-btn big" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send my build →'}</button>
      </form>
    </div>
  );
}
