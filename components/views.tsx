'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AREA_IDS } from '@/lib/engine';
import { AREAS, IND, INDUSTRY_IDS, PAIN_IDS, PAINS, TOOL_IDS, TOOLS, TYPES } from '@/lib/knowledge';
import type { Competitor, DataSource, DetectedTool, IndustryId, Module, ModuleType, PainId, Profile, RecommendResponse, ReviewTheme, ToolId } from '@/lib/types';
import { DemoAnim, LiveDemo } from './demos';
import { Arrow, Back, CheckMark, Icon, LinkIcon, ModIcon, Plus, Replay, Sparkle, moduleIcon } from './icons';


export function PreviewChip({ source }: { source: DataSource | null }) {
  if (source !== 'preview') return null;
  return <span className="chip chip-warn" title="The real scan isn't connected yet. This is stand-in data.">Preview data</span>;
}

/* ---------------- intro ---------------- */
export function IntroView({ onScan, onManual, busy }: { onScan: (url: string) => void; onManual: () => void; busy: boolean }) {
  const [url, setUrl] = useState('');
  const [err, setErr] = useState('');
  const orbit: ModuleType[] = ['after', 'missed', 'radar', 'reviews', 'noshow', 'briefing'];
  return (
    <div className="intro-wrap">
      <div className="portal" aria-hidden="true">
        <span className="ring r1" /><span className="ring r2" /><span className="ring r3" />
        <span className="core" />
        <div className="orbit">
          {orbit.map((t, i) => (
            <span key={t} className="orbiter" style={{ '--a': `${i * 60}deg` } as React.CSSProperties}>
              <span className="o-ico"><span className="o-in"><Icon name={moduleIcon(t)} /></span></span>
            </span>
          ))}
        </div>
      </div>
      <h1 className="intro-title">The AI marketplace built around <span className="grad-text">your business.</span></h1>
      <form className="url-form" noValidate onSubmit={e => {
        e.preventDefault();
        const v = url.trim();
        if (!/^(https?:\/\/)?(www\.)?([a-z0-9-]+\.)+[a-z]{2,}(\/\S*)?$/i.test(v)) { setErr('Enter a web address, like yourbusiness.com.'); return; }
        setErr(''); onScan(v);
      }}>
        <label className="sr-only" htmlFor="url-in">Your website address</label>
        <div className="cta-field">
          <Icon name="globe" className="field-ico" />
          <input id="url-in" type="text" inputMode="url" autoComplete="url" autoCapitalize="off" spellCheck={false} placeholder="yourbusiness.com"
            value={url} onChange={e => { setUrl(e.target.value); setErr(''); }} aria-invalid={err ? true : undefined} aria-describedby={err ? 'url-err' : undefined} />
        </div>
        <div className="btn-wrap"><button className="btn-primary" type="submit" disabled={busy}><span>Scan my business</span><Arrow /></button></div>
      </form>
      {err && <p className="form-err" id="url-err" role="alert">{err}</p>}
      <button type="button" className="link-btn" onClick={onManual}>No website? Enter your details instead</button>
    </div>
  );
}

/* ---------------- scan ---------------- */
export interface ScanState {
  domain: string;
  progress: number;
  status: string;
  pages: { url: string; title: string }[];
  facts: { key: string; label: string; value: string }[];
  tech: { tool: DetectedTool; label: string }[];
  reviews?: { rating: number; count: number; themes: ReviewTheme[] };
  competitors: Competitor[];
  done: boolean;
  error?: string;
}
export const emptyScan = (domain = ''): ScanState => ({ domain, progress: 2, status: 'Starting', pages: [], facts: [], tech: [], competitors: [], done: false });

export function ScanView({ scan, source }: { scan: ScanState; source: DataSource | null }) {
  const neg = scan.reviews?.themes.filter(t => t.sentiment === 'negative') || [];
  return (
    <>
      <div className="v-head"><span className="sys">{scan.done ? 'Scan complete' : 'Scanning'} · {scan.domain}</span><PreviewChip source={source} /></div>
      <div className="scan-bar"><span style={{ transform: `scaleX(${Math.max(0.02, scan.progress / 100)})` }} /></div>
      <p className="scan-status" aria-live="polite">{scan.error || scan.status}</p>
      <div className="scan-live">
        <div className="sl-col">
          <p className="sys">Pages read</p>
          <ul className="pages">
            {scan.pages.map(p => <li key={p.url} className="pop"><Icon name="page" /><span className="pg-t">{p.title}</span><em>{p.url}</em></li>)}
            {!scan.pages.length && <li className="ghost-row">Opening the site…</li>}
          </ul>
          <p className="sys">Tools on the site</p>
          <div className="tech-chips">
            {scan.tech.map(t => <span key={t.label} className="tech-chip pop"><Icon name="chip" />{TOOLS[t.tool.id].label}{t.tool.vendor ? <em> · {t.tool.vendor}</em> : null}</span>)}
            {!scan.tech.length && <span className="ghost-row">{scan.progress > 55 ? 'None found' : 'Checking…'}</span>}
          </div>
        </div>
        <div className="sl-col">
          <p className="sys">What Pip found</p>
          <ul className="finds">
            {scan.facts.map(f => <li key={f.key} className="pop"><span className="k">{f.label}</span><span className="v">{f.value}</span></li>)}
            {!scan.facts.length && <li className="ghost-row">Reading pages…</li>}
          </ul>
          {scan.reviews && (
            <div className="rev-card pop">
              <div className="rev-top"><b>{scan.reviews.rating.toFixed(1)}</b><span className="rev-stars" aria-hidden="true">★★★★★</span><span>{scan.reviews.count} Google reviews</span></div>
              {neg.length > 0 && <ul>{neg.map(t => <li key={t.label}><b>{t.count}</b> mention {t.label.toLowerCase()}</li>)}</ul>}
            </div>
          )}
          {scan.competitors.length > 0 && (
            <ul className="comps">
              {scan.competitors.map(c => <li key={c.name} className="pop"><Icon name="store" /><span className="c-name">{c.name}</span><em>{c.distanceMi != null ? `${c.distanceMi} mi` : ''}{c.rating != null ? ` · ${c.rating}★` : ''}</em>{c.note && <span className="c-note">{c.note}</span>}</li>)}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

/* ---------------- confirm ---------------- */
function Opts<T extends string>({ items, value, onToggle, labelledBy, found }: {
  items: [T, string][]; value: T[]; onToggle: (v: T) => void; labelledBy: string; found?: T[];
}) {
  return (
    <div className="opts" role="group" aria-labelledby={labelledBy}>
      {items.map(([k, l]) => (
        <button key={k} type="button" className="opt" aria-pressed={value.includes(k)} onClick={() => onToggle(k)}>
          {l}{found?.includes(k) && <span className="found-tag">found</span>}
        </button>
      ))}
    </div>
  );
}

export function ConfirmView({ draft, manual, source, onSubmit }: {
  draft: Profile; manual: boolean; source: DataSource | null; onSubmit: (p: Profile) => void;
}) {
  const [name, setName] = useState(draft.name);
  const [industry, setIndustry] = useState<IndustryId | null>(manual ? null : draft.industry);
  const [tools, setTools] = useState<ToolId[]>(draft.tools);
  const [pains, setPains] = useState<PainId[]>(draft.pains);
  const [err, setErr] = useState('');
  const found = draft.detected.map(d => d.id);

  const toggleTool = (t: ToolId) => setTools(cur => {
    if (cur.includes(t)) return cur.filter(x => x !== t);
    if (t === 'none') return ['none'];
    return [...cur.filter(x => x !== 'none'), t];
  });
  const togglePain = (p: PainId) => setPains(cur => (cur.includes(p) ? cur.filter(x => x !== p) : [...cur, p].slice(-2)));

  return (
    <>
      <div className="v-head"><span className="sys">{manual ? 'Tell Pip about your business' : `Pip found · ${draft.site || draft.name}`}</span><PreviewChip source={manual ? null : source} /></div>
      <form className="confirm" noValidate onSubmit={e => {
        e.preventDefault();
        const n = name.trim();
        if (!n) { setErr('Add your business name.'); return; }
        if (!industry) { setErr('Pick the closest industry.'); return; }
        if (!tools.length) { setErr("Pick the tools you use, or 'Nothing yet'."); return; }
        if (!pains.length) { setErr('Pick what eats most of your week.'); return; }
        setErr('');
        onSubmit({ ...draft, name: n.slice(0, 80), industry, tools, pains });
      }}>
        <div className="cf-card glass-lite">
          <label className="field">Business name<input className="inp" type="text" maxLength={80} value={name} onChange={e => setName(e.target.value)} autoComplete="organization" placeholder="Bright Smile Dental" /></label>
          <div className="field-group"><span className="field-label" id="lbl-ind">Industry</span>
            <Opts items={INDUSTRY_IDS.map(k => [k, IND[k].label] as [IndustryId, string])} value={industry ? [industry] : []} onToggle={v => setIndustry(v)} labelledBy="lbl-ind" />
          </div>
          <div className="field-group"><span className="field-label" id="lbl-tools">AI and tools you use</span>
            <Opts items={TOOL_IDS.map(k => [k, TOOLS[k].label] as [ToolId, string])} value={tools} onToggle={toggleTool} labelledBy="lbl-tools" found={found} />
          </div>
        </div>
        <div className="cf-card glass-lite cf-pains">
          <h2 className="q-title" id="lbl-pains">What eats most of your week?</h2>
          <p className="q-hint">Pick up to two.</p>
          <Opts items={PAIN_IDS.map(k => [k, PAINS[k].label] as [PainId, string])} value={pains} onToggle={togglePain} labelledBy="lbl-pains" />
          {err && <p className="form-err" role="alert">{err}</p>}
          <button className="btn-dark" type="submit"><span>Show my report</span><Arrow /></button>
        </div>
      </form>
    </>
  );
}

/* ---------------- report ---------------- */
export function ReportView({ profile, rec, example }: { profile: Profile; rec: RecommendResponse; example: boolean }) {
  const r = rec.report;
  const [n, setN] = useState(0);
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    setN(0); setDrawn(false);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) { setN(r.score); setDrawn(true); return; }
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setDrawn(true)));
    const t0 = performance.now();
    let raf = 0;
    const f = (now: number) => { const k = Math.min(1, (now - t0) / 1500); setN(Math.round(r.score * (1 - Math.pow(1 - k, 3)))); if (k < 1) raf = requestAnimationFrame(f); };
    raf = requestAnimationFrame(f);
    return () => { cancelAnimationFrame(id); cancelAnimationFrame(raf); };
  }, [r.score]);
  const neg = profile.themes.filter(t => t.sentiment === 'negative').sort((a, b) => b.count - a.count).slice(0, 2);
  return (
    <>
      <div className="v-head"><span className="sys">{example ? 'Their' : 'Your'} AI today · {profile.name}</span><PreviewChip source={rec.source} /></div>
      <div className="r-grid">
        <div className="score">
          <div className="dial-row">
            <div className="dial" role="img" aria-label={`AI coverage score ${r.score} out of 100`}>
              <svg viewBox="0 0 120 120" aria-hidden="true"><circle className="track" cx="60" cy="60" r="52" /><circle className="val" cx="60" cy="60" r="52" style={{ strokeDashoffset: drawn ? 326.73 * (1 - r.score / 100) : 326.73 }} /></svg>
              <div className="dial-n"><b>{n}</b><span>AI coverage</span></div>
            </div>
            <div className="dial-copy">
              <b>{r.headline}</b>
              <p>Biggest gap: {AREAS[r.gap]}.<span className="m-hide"> {r.competitorNote || `Most businesses like ${example ? 'this one' : 'yours'} reach 70+ with a few modules.`}</span></p>
            </div>
          </div>
          <ul className="areas">
            {AREA_IDS.map(k => (
              <li key={k} className={k === r.gap ? 'gap' : ''}><span>{AREAS[k]}</span><span className="bar"><span style={{ transform: `scaleX(${drawn ? r.areas[k] / 100 : 0})` }} /></span><em>{r.areas[k]}%</em></li>
            ))}
          </ul>
        </div>
        <div className="have">
          <span className="sys">{example ? 'What they have' : 'What you have'}</span>
          <ul className="have-list">
            {r.have.length ? r.have.map(h => <li key={h.tool}><b>{h.label}</b><span className="ok">{h.does}</span><span className="lim">{h.limit}</span></li>)
              : <li><b>No AI yet</b><span className="ok">A clean start, with nothing to undo</span><span className="lim">Every lead and question still runs through {example ? 'them' : 'you'}</span></li>}
          </ul>
          {neg.length > 0 && (
            <div className="said">
              <span className="sys">What customers say</span>
              {neg.map(t => <p key={t.label}><b>{t.count}× {t.label}</b>{t.quote && <span>&ldquo;{t.quote}&rdquo;</span>}</p>)}
            </div>
          )}
          {profile.kit?.facts && profile.kit.facts.length > 0 && (
            <div className="learned">
              <span className="sys">What I learned</span>
              <ul>{profile.kit.facts.slice(0, neg.length ? 2 : 4).map(f => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          {r.overlap && <div className="overlap"><b>Where you might be paying twice</b><p>{r.overlap}</p></div>}
        </div>
      </div>
    </>
  );
}

/* ---------------- market ---------------- */
export function MarketView({ profile, modules, added, source, onOpen, onToggle, onTray, trayRef }: {
  profile: Profile; modules: Module[]; added: ModuleType[]; source: DataSource | null;
  onOpen: (t: ModuleType) => void; onToggle: (t: ModuleType, from?: HTMLElement | null) => void; onTray: () => void;
  trayRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <>
      <div className="v-head">
        <span className="sys">Marketplace · built for {profile.name}</span>
        <span className="v-head-r"><PreviewChip source={source} />
          <button className="tray" type="button" ref={trayRef} onClick={onTray}>
            <span className="tray-icons">{added.slice(0, 4).map(t => <span key={t}><Icon name={moduleIcon(t)} /></span>)}</span>
            <span>{added.length} in build</span>
          </button>
        </span>
      </div>
      <div className="mk-grid">
        {modules.map((m, i) => {
          const on = added.includes(m.type);
          return (
            <article key={m.type} className={`mk glass-lite${on ? ' on' : ''}`} data-tilt="6" style={{ '--i': i } as React.CSSProperties}>
              <button className="mk-open" type="button" aria-label={`Preview ${m.name}, ${m.match}% match`} onClick={() => onOpen(m.type)} />
              <div className="mk-top"><ModIcon type={m.type} /><span className="match">{m.match}%<span className="mt"> match</span></span></div>
              {i < 2 && <span className="pick">Pip&apos;s pick</span>}
              <h3 className="mk-name">{m.name}</h3>
              <p className="mk-line">{m.line}</p>
              {m.why && <p className="mk-why"><Sparkle />{m.why}</p>}
              <div className="mk-bot">
                <span className="impact">{m.impact}</span>
                <button className="add" type="button" aria-pressed={on} aria-label={`${on ? 'Remove' : 'Add'} ${m.name} ${on ? 'from' : 'to'} build`}
                  onClick={e => { e.stopPropagation(); onToggle(m.type, e.currentTarget.closest('.mk')?.querySelector<HTMLElement>('.ico-chip')); }}>
                  <span className="i-off"><Plus /></span><span className="i-on"><CheckMark /></span>
                </button>
              </div>
              <span className="sweep" aria-hidden="true" />
            </article>
          );
        })}
      </div>
      <p className="mk-note">Impact numbers are example estimates.</p>
    </>
  );
}

/* ---------------- detail ---------------- */
export const canLive = (m: Module) => m.demo.kind === 'chat' || m.demo.kind === 'phone';

export function DetailView({ profile, module, onBack, mode, setMode, onLiveReply, replayKey, onReplay }: {
  profile: Profile; module: Module; onBack: () => void; mode: 'watch' | 'live'; setMode: (m: 'watch' | 'live') => void;
  onLiveReply: () => void; replayKey: number; onReplay: () => void;
}) {
  const T = TYPES[module.type];
  return (
    <>
      <div className="v-head">
        <button className="back" type="button" onClick={onBack}><Back />Marketplace</button>
        {canLive(module) && (
          <div className="seg" role="group" aria-label="Demo mode">
            <button type="button" aria-pressed={mode === 'watch'} onClick={() => setMode('watch')}>Watch it</button>
            <button type="button" aria-pressed={mode === 'live'} onClick={() => setMode('live')}>Try it live</button>
          </div>
        )}
      </div>
      <div className={`d-grid${mode === 'live' && canLive(module) ? ' is-live' : ''}`}>
        <div className="d-info">
          <ModIcon type={module.type} />
          <h2 className="d-name">{module.name}</h2>
          <p className="d-line">{module.line}</p>
          {module.why && <p className="d-why"><Sparkle /><span><b>Why Pip suggests it</b>{module.why}</span></p>}
          <div className="uses"><span className="sys">Built from</span><div className="uses-chips">{module.uses.map(u => <span key={u}>{u}</span>)}{module.worksWith && <span className="ww">{module.worksWith}</span>}</div></div>
          <p className="d-impact"><b className="grad-text">{module.impact}</b><span className="sys">est. · {module.match}% match · {T.cat}</span></p>
          {mode === 'watch' && <button className="replay" type="button" onClick={onReplay}><Replay />Replay</button>}
        </div>
        <div className="d-demo">
          {mode === 'watch' || !canLive(module)
            ? <DemoAnim key={`${module.type}-${replayKey}`} module={module} profile={profile} />
            : <LiveDemo key={module.type} module={module} profile={profile} onFirstReply={onLiveReply} />}
        </div>
      </div>
    </>
  );
}

/* ---------------- build ---------------- */
export function BuildView({ profile, modules, added, onShare, shareState, shareUrl }: {
  profile: Profile; modules: Module[]; added: ModuleType[]; onShare: () => void; shareState: 'idle' | 'copied' | 'manual'; shareUrl: string;
}) {
  const list = added.map(t => modules.find(m => m.type === t)).filter(Boolean) as Module[];
  const n = list.length || 1;
  const initials = (profile.name.match(/[A-Za-z0-9]+/g) || ['Y', 'B']).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  const shareRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (shareState === 'manual') shareRef.current?.select(); }, [shareState]);
  return (
    <>
      <div className="v-head"><span className="sys">{profile.name} · build</span><span className="chip">Example estimates</span></div>
      <div className="b-grid">
        <div className="const">
          <span className="b-core">{initials}</span>
          <div className="c-orbit play">
            {list.map((m, i) => (
              <span key={m.type} className="c-orb" style={{ '--a': `${(360 / n) * i}deg` } as React.CSSProperties}>
                <span className="c-chip" style={{ '--i': i } as React.CSSProperties}><span className="c-in"><ModIcon type={m.type} /><b>{m.name}</b></span></span>
              </span>
            ))}
          </div>
        </div>
        <div className="b-side">
          <ul className="b-list">
            {list.length ? list.map(m => <li key={m.type}><ModIcon type={m.type} /><span>{m.name}</span><span className="impact">{m.impact}</span></li>) : <li className="b-empty">No modules yet</li>}
          </ul>
          <ul className="b-meta">
            <li><Icon name="check" />Ready in about a day</li>
            <li><Icon name="check" />Checked by a person</li>
            <li><Icon name="check" />We run it for you</li>
          </ul>
          <button type="button" className="share-btn" onClick={onShare} disabled={!list.length}><LinkIcon />{shareState === 'copied' ? 'Link copied' : 'Copy a link to this build'}</button>
          {shareState === 'manual' && <input ref={shareRef} className="inp share-inp" readOnly value={shareUrl} aria-label="Link to this build" />}
        </div>
      </div>
    </>
  );
}

/* ---------------- send ---------------- */
export function SendView({ profile, modules, added, sent, onSend, example }: {
  profile: Profile; modules: Module[]; added: ModuleType[]; sent: { first: string } | null; example: boolean;
  onSend: (name: string, contact: string) => Promise<string | null>;
}) {
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const list = useMemo(() => added.map(t => modules.find(m => m.type === t)).filter(Boolean) as Module[], [added, modules]);
  if (sent) {
    return (
      <div className="s-wrap done">
        <span className="done-orb"><CheckMark /></span>
        <h2 className="s-title">You&apos;re all set, {sent.first}.</h2>
        <p>{example
          ? 'A person on our team will look at your business and reach out within one business day with a build made for it.'
          : `A person on our team will review ${profile.name}'s build and reach out within one business day.`}</p>
      </div>
    );
  }
  return (
    <form className="s-wrap" noValidate onSubmit={async e => {
      e.preventDefault();
      const n = name.trim(), c = contact.trim();
      if (!n) { setErr('Add your name.'); return; }
      if (!(/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(c) || c.replace(/\D/g, '').length >= 10)) { setErr('Add an email address or a phone number with area code.'); return; }
      setErr(''); setBusy(true);
      const fail = await onSend(n, c);
      setBusy(false);
      if (fail) setErr(fail);
    }}>
      <h2 className="s-title">{example ? <>Get a build like this <span className="grad-text">for your business.</span></> : <>Send me <span className="grad-text">{profile.name}&apos;s build.</span></>}</h2>
      <div className="s-mods">{list.map(m => <span key={m.type}><ModIcon type={m.type} />{m.name}</span>)}</div>
      <div className="s-row">
        <label className="field">Your name<input className="inp" id="f-cname" type="text" autoComplete="name" maxLength={60} placeholder="Alex Rivera" value={name} onChange={e => setName(e.target.value)} /></label>
        <label className="field">Email or phone<input className="inp" type="text" autoComplete="email" maxLength={80} placeholder="alex@yourbusiness.com" value={contact} onChange={e => setContact(e.target.value)} /></label>
      </div>
      {err && <p className="form-err" role="alert">{err}</p>}
      <div className="btn-wrap"><button className="btn-primary" type="submit" disabled={busy}><span>{busy ? 'Sending…' : example ? 'Send me a build' : 'Send me my build'}</span><Arrow /></button></div>
      <p className="s-fine">Free. A person reviews every build. No prices until you&apos;ve seen it work.</p>
    </form>
  );
}
