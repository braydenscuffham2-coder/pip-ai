'use client';
import { useEffect, useRef, useState } from 'react';
import { demoReply } from '@/lib/api';
import type { ChatTurn, Module, Profile } from '@/lib/types';
import { Icon, Replay, Up } from './icons';

const t = (s: number) => ({ '--t': `${s}s` } as React.CSSProperties);
const Check = () => <Icon name="check" style={{ stroke: 'currentColor' }} />;

function CountUp({ value, delay }: { value: string; delay: number }) {
  const m = value.match(/^(\D*?)(\d[\d,]*)(.*)$/);
  const [n, setN] = useState(m ? 0 : null);
  useEffect(() => {
    if (!m) return;
    const to = Number(m[2].replace(/,/g, ''));
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setN(to); return; }
    let raf = 0;
    const timer = setTimeout(() => {
      const t0 = performance.now();
      const f = (now: number) => { const k = Math.min(1, (now - t0) / 1400); setN(Math.round(to * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f); };
      raf = requestAnimationFrame(f);
    }, delay);
    return () => { clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return <span>{value}</span>;
  return <><b>{m[1]}{n}</b><span>{m[3].trim()}</span></>;
}

export function DemoAnim({ module, profile }: { module: Module; profile: Profile }) {
  const d = module.demo;
  switch (d.kind) {
    case 'chat':
      return (
        <div className="demo play">
          <div className="dc-head"><span className="sys">Website chat · {module.type === 'after' ? '10:42 PM' : '2:15 PM'}</span><span className="live">{module.name}</span></div>
          <div className="feed">
            <p className="msg in seq" style={t(0.3)}>{d.c}</p>
            <p className="msg ai seq" style={t(1.3)}>{d.r}</p>
            <p className="ev seq" style={t(2.4)}><Check />{d.res}</p>
          </div>
        </div>
      );
    case 'phone':
      return (
        <div className="demo play">
          <div className="ph-call seq" style={t(0.2)}><Icon name="missed" /><div><b>Missed call</b><span>(555) 014-2290 · 5:58 PM</span></div></div>
          <div className="feed">
            <p className="msg ai seq" style={t(1)}>Hi, it&apos;s {profile.name}. Sorry we missed you! What can we help with?<small>Sent 8 sec later</small></p>
            <p className="msg in seq" style={t(2)}>{d.c}</p>
            <p className="msg ai seq" style={t(2.8)}>{d.r}</p>
            <p className="ev seq" style={t(3.7)}><Check />{d.res}</p>
          </div>
        </div>
      );
    case 'timeline':
      return (
        <div className="demo play">
          <div className="dc-head"><span className="sys">{module.name} · running</span><span className="live">Automatic</span></div>
          <ol className="tl">{d.steps.map((s, i) => <li key={i} className={`seq${i === d.steps.length - 1 ? ' ok' : ''}`} style={t(0.2 + i * 0.75)}>{s}</li>)}</ol>
        </div>
      );
    case 'trigger':
      return (
        <div className="demo play">
          <div className="fc seq" style={t(0.2)}><Icon name="season" /><div><span className="sys">Pip noticed</span><b>{d.trig}</b></div></div>
          <div className="sz-step seq" style={t(1)}><span>{d.act}</span><span className="bar"><span /></span><span className="sys">Running automatically</span></div>
          <div className="sz-count seq" style={t(2.6)}><CountUp value={d.res} delay={2900} /></div>
        </div>
      );
    case 'review':
      return (
        <div className="demo play">
          <p className="rv-job seq" style={t(0.2)}><Icon name="check" />{d.svc} · Done</p>
          <p className="msg ai seq" style={t(0.9)}>How did we do today?</p>
          <div className="stars seq" style={t(1.5)} role="img" aria-label="5 stars">{[0, 1, 2, 3, 4].map(k => <i key={k} style={{ '--k': k } as React.CSSProperties}>★</i>)}</div>
          <p className="msg ai seq" style={t(2.5)}>Thank you! Would you post that on Google?</p>
          <p className="rv-card seq" style={t(3.3)}><span className="s">★★★★★</span>&ldquo;{d.rev}&rdquo;<small>A happy customer · Google</small></p>
          <p className="note seq" style={t(3.9)}>Low ratings go to you first</p>
        </div>
      );
    case 'map':
      return (
        <div className="demo play">
          <svg className="map" viewBox="0 0 320 200" role="img" aria-label="Map: urgent job assigned to the closest tech, 12 minutes away">
            <rect className="m-bg" width="320" height="200" rx="18" /><rect className="m-park" x="176" y="118" width="70" height="46" rx="10" />
            <path className="m-st" d="M0 150H320M0 70H320M140 0V200M250 0V200M40 0V200M0 20L120 200" />
            <path className="route" d="M40 150H140V70H210" />
            <circle className="tech" cx="40" cy="150" r="7" /><text className="tech-l near" x="52" y="168">Mike · 12 min</text>
            <circle className="tech" cx="282" cy="176" r="7" /><text className="tech-l" x="226" y="196">Ana · 25 min</text>
            <circle className="tech" cx="282" cy="36" r="7" /><text className="tech-l" x="236" y="22">Joe · 31 min</text>
            <circle className="pin-ring" cx="210" cy="70" r="9" /><circle className="pin" cx="210" cy="70" r="8" />
            <text className="pin-l" x="210" y="52" textAnchor="middle">{d.job.toUpperCase().slice(0, 14)}</text>
          </svg>
          <p className="ev seq" style={t(2.6)}><Check />Assigned to Mike · 12 min away</p>
        </div>
      );
    case 'brief':
      return (
        <div className="demo play">
          <div className="brief">
            <div className="br-head seq" style={t(0.2)}><span className="logo-orb" aria-hidden="true" /><div><b>Good morning</b><span>7:00 AM · Briefing from Pip</span></div></div>
            <ul>{d.lines.map((l, i) => <li key={i} className="seq" style={t(0.9 + i * 0.55)}>{l}</li>)}</ul>
          </div>
        </div>
      );
  }
}

const GENERIC_ASKS = ['What are your hours?', 'How much does it cost?', 'Can I book something this week?'];

export function LiveDemo({ profile, module, onFirstReply }: { profile: Profile; module: Module; onFirstReply?: () => void }) {
  const [msgs, setMsgs] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const feed = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const firstAsk = module.demo.kind === 'chat' || module.demo.kind === 'phone' ? module.demo.c : GENERIC_ASKS[2];
  const suggestions = Array.from(new Set([firstAsk, ...(profile.kit?.asks || []), ...GENERIC_ASKS])).slice(0, 3);

  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => { inputRef.current?.focus({ preventScroll: true }); }, []);

  async function send(text: string) {
    const v = text.trim().slice(0, 300);
    if (!v || busy) return;
    const next: ChatTurn[] = [...msgs, { role: 'user', content: v }];
    setMsgs(next); setInput(''); setBusy(true); setErr('');
    try {
      const r = await demoReply(profile, module.type, next);
      setMsgs(m => [...m, { role: 'assistant', content: r.reply }]);
      if (next.filter(m => m.role === 'user').length === 1) onFirstReply?.();
    } catch {
      setErr("That message didn't go through. Try sending it again.");
    } finally {
      setBusy(false);
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  return (
    <div className="live-demo">
      <div className="dc-head">
        <span className="sys">Live demo · you&apos;re the customer</span>
        <button type="button" className="mini-btn" onClick={() => { setMsgs([]); setErr(''); }} disabled={!msgs.length || busy}><Replay />Reset</button>
      </div>
      <div className="ld-feed" ref={feed} aria-live="polite">
        {!msgs.length && (
          <div className="ld-empty">
            <p>Text <b>{profile.name}</b> the way a customer would. It answers using what Pip learned.</p>
            <div className="ld-sugs">{suggestions.map(s => <button key={s} type="button" className="sug" onClick={() => send(s)}>{s}</button>)}</div>
          </div>
        )}
        {msgs.map((m, i) => <p key={i} className={`msg ${m.role === 'user' ? 'in' : 'ai'} pop`}>{m.content}</p>)}
        {busy && <p className="msg ai typing-dots" aria-label="Typing"><i /><i /><i /></p>}
      </div>
      {err && <p className="ld-err" role="alert">{err}</p>}
      <form className="ld-input" onSubmit={e => { e.preventDefault(); send(input); }}>
        <label className="sr-only" htmlFor="ld-in">Message as a customer</label>
        <input id="ld-in" ref={inputRef} type="text" autoComplete="off" maxLength={300} placeholder={`Message ${profile.name}…`} value={input} onChange={e => setInput(e.target.value)} />
        <button type="submit" aria-label="Send" disabled={!input.trim() || busy}><Up /></button>
      </form>
    </div>
  );
}
