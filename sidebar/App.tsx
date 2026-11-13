import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pip, type Mood } from '@/components/Pip';
import { Icon } from '@/components/icons';
import { outfitFor, OUTFIT_LABEL } from '@/lib/outfit';
import { normalizeDomain } from '@/lib/preview';
import type { Raw } from '@/lib/server/gather';
import { askPip, BrainError, designSkills, loadBrief, manualRaw, readFacts, saveBrief, understand, type ManualInput } from './brain';
import { SetupSlide } from './setup';
import { AiSlide, BuildSlide, IntroSlide, ReviewsSlide, RivalsSlide, ScanSlide, SendSlide, UpgradesSlide, WhoSlide, type FeedLine } from './slides';
import type { Brief, Skill, Understanding } from './types';

export type Step = 'intro' | 'scan' | 'who' | 'ai' | 'reviews' | 'rivals' | 'upgrades' | 'build' | 'setup' | 'send';
const LABEL: Record<Step, string> = { intro: 'Hello', scan: 'Scan', who: 'Your business', ai: 'Your AI', reviews: 'Customers', rivals: 'Competition', upgrades: 'Upgrades', build: 'Your build', setup: 'Set up', send: 'Send' };

interface Say { id: number; text: string; mood: Mood; acts?: { label: string; primary?: boolean; on: () => void }[] }

const ERR: Record<string, string> = {
  no_browser: 'I can only read websites from inside the Claude desktop app. Open this page there, or tell me about your business instead.',
  no_model: "I need permission to think on your Claude plan. Allow it when asked, then try again.",
  blocked: "That site blocks scanners and I couldn't find it on Google. Tell me about the business instead and I'll work from that.",
  unreachable: "I couldn't open that site or find it on Google. Check the address, or tell me about the business instead.",
  rate_limited: "I'm thinking too fast for your plan right now. Give it a minute and try again.",
  model_failed: 'My thinking got cut off. Try again, and it usually works the second time.',
};

export function App() {
  const [step, setStep] = useState<Step>('intro');
  const [raw, setRaw] = useState<Raw | null>(null);
  const [und, setUnd] = useState<Understanding | null>(null);
  const [skills, setSkills] = useState<Skill[] | null>(null);
  const [skillsErr, setSkillsErr] = useState<string | null>(null);
  const [narr, setNarr] = useState<Brief['narration']>({ upgrades: '', build: '' });
  const [picked, setPicked] = useState<string[]>([]);
  const [feed, setFeed] = useState<FeedLine[]>([]);
  const [thinking, setThinking] = useState<{ label: string; chars: number } | null>(null);
  const [domain, setDomain] = useState<string | null>(null);
  const [say, setSay] = useState<Say>({ id: 0, text: "Hi, I'm Pip. Give me your website and I'll study your business, your reviews and your competition, then show you the AI that would help you most.", mood: 'idle' });
  const [hop, setHop] = useState(0);
  const [asking, setAsking] = useState(false);
  const run = useRef(0);
  const sid = useRef(0);

  const brief: Brief | null = useMemo(() => (raw && und ? { domain, raw, und, skills: skills || [], narration: narr, at: new Date().toISOString() } : null), [raw, und, skills, narr, domain]);
  const outfit = outfitFor(und ? { name: und.name, industry: und.industry, services: und.services, desc: und.oneLiner } : null);

  const speak = useCallback((text: string, mood: Mood = 'present', acts?: Say['acts']) => setSay({ id: ++sid.current, text, mood, acts }), []);

  /* ---------- the slide order for this business ---------- */
  const order: Step[] = useMemo(() => {
    const o: Step[] = ['intro', 'scan', 'who', 'ai'];
    if (und?.reviews.themes.length || und?.rating != null) o.push('reviews');
    if (und?.competition.rivals.length) o.push('rivals');
    o.push('upgrades', 'build', 'setup', 'send');
    return o;
  }, [und]);
  const idx = order.indexOf(step);
  const go = useCallback((s: Step) => setStep(s), []);
  const next = () => { const n = order[idx + 1]; if (n) go(n); };
  const back = () => { const p = order[idx - 1]; if (p && p !== 'scan') go(p); else if (p === 'scan') go('intro'); };

  /* ---------- narration per slide ---------- */
  useEffect(() => {
    if (!und) return;
    const nm = und.name;
    switch (step) {
      case 'who': speak(und.narration.who || `Meet ${nm}. Here's what I learned. Tell me if I got anything wrong.`, 'present', [{ label: 'Looks right', primary: true, on: next }]); break;
      case 'ai': speak(und.narration.ai || `Here's the AI working for ${nm} today, and where it falls short.`, 'present', [{ label: 'Next', primary: true, on: next }]); break;
      case 'reviews': speak(und.narration.reviews || `This is what your customers are telling the world.`, 'present', [{ label: 'Next', primary: true, on: next }]); break;
      case 'rivals': speak(und.narration.competition || `Here's who you're up against nearby.`, 'present', [{ label: 'Next', primary: true, on: next }]); break;
      case 'upgrades':
        if (skills) speak(narr.upgrades || `I designed these for ${nm}. Tap any one to watch it work, or ask me to build something new.`, 'present');
        else if (skillsErr) speak(skillsErr, 'idle', [{ label: 'Try again', primary: true, on: () => raw && und && void makeSkills(raw, und) }]);
        else speak(`I'm designing skills around your services and reviews right now. They'll appear here in a moment.`, 'think');
        break;
      case 'build': speak(picked.length ? (narr.build || `Here's your build. A person on our team checks everything before it goes live.`) : 'Your build is empty. Add a few skills first.', picked.length ? 'happy' : 'idle', picked.length ? [{ label: 'Set it up now', primary: true, on: () => go('setup') }, { label: 'Just send it to me', on: () => go('send') }] : [{ label: 'Back to upgrades', primary: true, on: () => go('upgrades') }]); break;
      case 'send': speak('Where should I send it? A real person reviews it and reaches out within one business day.', 'present'); break;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, und, skills === null, skillsErr]);

  /* ---------- keyboard: arrows move through slides ---------- */
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,[contenteditable]')) return;
      if (e.key === 'ArrowRight' && und && idx >= 2) next();
      if (e.key === 'ArrowLeft' && und && idx > 2) back();
    };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  });

  /* ---------- skills (run in the background while the owner watches) ---------- */
  async function makeSkills(r: Raw, u: Understanding, my = run.current) {
    setSkills(null); setSkillsErr(null);
    try {
      const out = await designSkills(r, u);
      if (my !== run.current) return;
      setSkills(out.skills); setNarr(out.narration);
      setPicked(out.skills.slice(0, 2).map(s => s.id));
      void saveBrief({ domain: normalizeDomain(r.domain) ? r.domain : null, raw: r, und: u, skills: out.skills, narration: out.narration, at: new Date().toISOString() });
    } catch (e) {
      if (my !== run.current) return;
      setSkillsErr(ERR[(e as BrainError).code] || ERR.model_failed);
    }
  }

  /* ---------- the walkthrough ---------- */
  async function start(input: { site?: string; manual?: ManualInput }, fresh = false) {
    const my = ++run.current;
    setRaw(null); setUnd(null); setSkills(null); setSkillsErr(null); setPicked([]); setFeed([]); setThinking(null);
    go('scan');
    const d = input.site ? normalizeDomain(input.site) : null;
    setDomain(d);
    const add = (l: FeedLine) => { if (my === run.current) setFeed(f => [...f, l]); };
    const wait = (ms: number) => new Promise(r => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
    try {
      if (d && !fresh) {
        const cached = await loadBrief(d);
        if (cached && my === run.current) {
          add({ icon: 'check', text: `I studied ${cached.und.name} recently. Picking up where we left off.` });
          setRaw(cached.raw); setUnd(cached.und); setSkills(cached.skills); setNarr(cached.narration); setPicked(cached.skills.slice(0, 2).map(s => s.id));
          await wait(700);
          if (my === run.current) go('who');
          return;
        }
      }
      let r: Raw;
      if (d) {
        speak(`Reading ${d}, its Google listing and the businesses around it.`, 'scan');
        add({ icon: 'globe', text: `Opening ${d}` });
        r = await readFacts(d);
        if (my !== run.current) return;
        for (const p of r.pages) { add({ icon: 'page', text: p.title, sub: p.url.replace(/^https?:\/\/(www\.)?/, '') }); await wait(140); }
        if (r.siteBlocked) add({ icon: 'globe', text: 'The site blocks scanners, so I used the Google listing' });
        for (const t of r.detected) { add({ icon: 'chip', text: `Found ${t.vendor}`, sub: t.evidence }); await wait(140); }
        if (!r.detected.length && r.pages.length) add({ icon: 'chip', text: 'No chat, booking or AI tools on the site' });
        if (r.place?.rating != null) { add({ icon: 'review', text: `${r.place.rating.toFixed(1)}★ from ${r.place.count} Google reviews`, sub: `Reading the latest ${r.place.reviews.length}` }); await wait(160); }
        for (const c of r.competitors) { add({ icon: 'pin', text: c.name, sub: `${c.rating ?? '?'}★ · ${c.distanceMi ?? '?'} mi away` }); await wait(120); }
      } else {
        r = manualRaw(input.manual!);
        add({ icon: 'store', text: `Working from what you told me about ${input.manual!.name}` });
      }
      setRaw(r);
      speak('Got everything. Now I\'m studying it: your services, what customers say, and where AI fits.', 'think');
      setThinking({ label: 'Studying your business', chars: 0 });
      const u = await understand(r, undefined, n => my === run.current && setThinking({ label: 'Studying your business', chars: n }));
      if (my !== run.current) return;
      setThinking(null); setUnd(u);
      void makeSkills(r, u, my);
      const o = outfitFor({ name: u.name, industry: u.industry, services: u.services, desc: u.oneLiner });
      if (o !== 'none') add({ icon: 'check', text: `Putting on ${OUTFIT_LABEL[o]}` });
      await wait(600);
      if (my === run.current) go('who');
    } catch (e) {
      if (my !== run.current) return;
      setThinking(null);
      const code = e instanceof BrainError ? e.code : 'model_failed';
      console.warn('[pip]', code, (e as Error)?.message);
      speak(ERR[code] || ERR.model_failed, 'idle', [
        { label: 'Tell Pip about it', primary: true, on: () => { go('intro'); setTimeout(() => document.getElementById('m-name')?.focus(), 300); } },
        ...(d ? [{ label: 'Try again', on: () => void start({ site: d }, true) }] : []),
      ]);
    }
  }

  async function correct(note: string) {
    if (!raw) return;
    const my = ++run.current;
    speak('Got it. Updating everything with that.', 'think');
    setThinking({ label: 'Updating', chars: 0 });
    try {
      const u = await understand(raw, note);
      if (my !== run.current) return;
      setThinking(null); setUnd(u); void makeSkills(raw, u, my);
      speak(u.narration.who || 'Updated. Take another look.', 'happy', [{ label: 'Looks right', primary: true, on: next }]);
    } catch (e) {
      if (my !== run.current) return;
      setThinking(null);
      speak(ERR[(e as BrainError).code] || ERR.model_failed, 'idle');
    }
  }

  function toggle(id: string, name: string) {
    setPicked(p => {
      const on = p.includes(id);
      speak(on ? `Took ${name} out of your build.` : `${name} is in your build.`, on ? 'present' : 'happy');
      return on ? p.filter(x => x !== id) : [...p, id];
    });
    setHop(h => h + 1);
  }

  function addCustom(k: Skill) {
    setSkills(s => [k, ...(s || [])]);
    setPicked(p => [...p, k.id]);
    speak(`Done. I designed ${k.name} for you and added it to your build.`, 'happy');
    setHop(h => h + 1);
  }

  async function ask(q: string) {
    setAsking(true);
    const prev = say;
    speak('Let me think…', 'think');
    try {
      const a = await askPip(q, brief, LABEL[step], []);
      setSay({ id: ++sid.current, text: a, mood: 'talk', acts: prev.acts });
    } catch (e) {
      speak(ERR[(e as BrainError).code] || ERR.model_failed, 'idle', prev.acts);
    } finally { setAsking(false); }
  }

  function restart() {
    run.current++;
    setRaw(null); setUnd(null); setSkills(null); setFeed([]); setThinking(null); setPicked([]); setDomain(null);
    go('intro');
    speak("Let's do another one. Give me a website, or tell me about a business.", 'idle');
  }

  const chosen = (skills || []).filter(s => picked.includes(s.id));
  const canNav = !!und && idx >= 2;

  return (
    <div className="deck">
      <div className="aurora" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      <header className="dk-top">
        <div className="dk-brand"><span className="logo-orb" aria-hidden="true" /><b>Pip</b>{und && <span className="dk-for">presenting {und.name}</span>}</div>
        {und && (
          <nav className="dk-dots" aria-label="Slides">
            {order.filter(s => s !== 'intro' && s !== 'scan').map(s => (
              <button key={s} type="button" className={s === step ? 'on' : order.indexOf(s) < idx ? 'done' : ''} onClick={() => go(s)} aria-current={s === step ? 'step' : undefined}>
                <i aria-hidden="true" /><span>{LABEL[s]}</span>
              </button>
            ))}
          </nav>
        )}
        <button type="button" className="dk-icon" onClick={restart} aria-label="Start over" title="Start over">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" /></svg>
        </button>
      </header>

      <main className="dk-main">
        <aside className="dk-stage" aria-label="Pip">
          <div className="podium">
            <Pip mood={thinking ? 'think' : say.mood === 'talk' ? 'talk' : say.mood} hopKey={hop} outfit={outfit} onPoke={() => setHop(h => h + 1)} />
            <span className="spot" aria-hidden="true" />
          </div>
          <Narration say={say} thinking={thinking} onAsk={ask} askOn={!!und && !asking} />
        </aside>

        <section className="dk-screen glass" aria-live="polite">
          {canNav && <div className="dk-count" aria-hidden="true">{String(idx - 1).padStart(2, '0')} / {String(order.length - 2).padStart(2, '0')}</div>}
          <div className="dk-slide" key={step + (und ? und.name : '')}>
            {step === 'intro' && <IntroSlide onSite={site => void start({ site })} onManual={m => void start({ manual: m })} onExample={() => void start({ site: 'robgoodsonplumbing.com' })} />}
            {step === 'scan' && <ScanSlide feed={feed} thinking={thinking} domain={domain} />}
            {step === 'who' && und && <WhoSlide und={und} onCorrect={correct} busy={!!thinking} />}
            {step === 'ai' && und && <AiSlide und={und} />}
            {step === 'reviews' && und && <ReviewsSlide und={und} />}
            {step === 'rivals' && und && <RivalsSlide und={und} />}
            {step === 'upgrades' && brief && <UpgradesSlide brief={brief} skills={skills} error={skillsErr} picked={picked} onToggle={toggle} onCustom={addCustom} onRetry={() => raw && und && void makeSkills(raw, und)} speak={speak} />}
            {step === 'build' && brief && <BuildSlide brief={brief} chosen={chosen} onRemove={k => toggle(k.id, k.name)} />}
            {step === 'setup' && brief && (chosen.length ? <SetupSlide key={chosen.map(k => k.id).join()} brief={brief} chosen={chosen} speak={speak} onDone={() => go('send')} /> : <div className="sl"><p className="sl-eye">Set up</p><h2 className="sl-h2">Add a skill to your build first</h2><button type="button" className="dk-btn" onClick={() => go('upgrades')}>Back to upgrades</button></div>)}
            {step === 'send' && brief && <SendSlide brief={brief} chosen={chosen} onSent={first => speak(`Sent! Talk soon, ${first}.`, 'happy', [{ label: 'Scan another business', on: restart }])} />}
          </div>
          {canNav && (
            <div className="dk-nav">
              <button type="button" className="dk-btn ghost" onClick={back} disabled={idx <= 2}>← Back</button>
              {order[idx + 1] && <button type="button" className="dk-btn" onClick={next}>Next: {LABEL[order[idx + 1]]} →</button>}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

/* ---------- Pip's speech bubble: types out, holds actions, and takes questions ---------- */
function Narration({ say, thinking, onAsk, askOn }: { say: Say; thinking: { label: string; chars: number } | null; onAsk: (q: string) => void; askOn: boolean }) {
  const [shown, setShown] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setShown(say.text); return; }
    setShown('');
    let i = 0;
    const t = setInterval(() => { i += 2; setShown(say.text.slice(0, i)); if (i >= say.text.length) clearInterval(t); }, 16);
    return () => clearInterval(t);
  }, [say.id, say.text]);
  return (
    <div className="dk-bubble glass">
      <p className="b-name"><i />Pip <em>· your AI consultant</em></p>
      <p className="dk-say" aria-hidden="true">{shown}<span className="caret" /></p>
      <p className="sr-only" aria-live="polite">{say.text}</p>
      {thinking && (
        <div className="dk-think"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span>{thinking.label}{thinking.chars > 0 && <em>{(thinking.chars / 1000).toFixed(1)}k written</em>}</div>
      )}
      {!!say.acts?.length && !thinking && (
        <div className="dk-acts">{say.acts.map(a => <button key={a.label} type="button" className={a.primary ? 'dk-btn' : 'dk-btn ghost'} onClick={a.on}>{a.label}</button>)}</div>
      )}
      {askOn && (
        <form className="dk-ask" onSubmit={e => { e.preventDefault(); const v = q.trim(); if (v) { onAsk(v); setQ(''); } }}>
          <label className="sr-only" htmlFor="ask-in">Ask Pip</label>
          <input id="ask-in" value={q} onChange={e => setQ(e.target.value)} placeholder="Ask Pip anything…" maxLength={300} autoComplete="off" />
          <button type="submit" aria-label="Ask" disabled={!q.trim()}>↑</button>
        </form>
      )}
    </div>
  );
}


