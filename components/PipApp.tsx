'use client';
import { outfitFor, OUTFIT_LABEL } from '@/lib/outfit';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, askPip, getRecommendations, scanSite, submitLead } from '@/lib/api';
import { isModuleType, sanitizeProfile } from '@/lib/engine';
import { AREAS, BRAND, TYPES } from '@/lib/knowledge';
import type { ChatTurn, DataSource, ModuleType, Profile, RecommendResponse, ScanEvent, ToolId } from '@/lib/types';
import { Bubble, type Action, type Speech } from './Bubble';
import { Replay } from './icons';
import { Pip, type Mood } from './Pip';
import {
  BuildView, ConfirmView, DetailView, IntroView, MarketView, ReportView, ScanView, SendView, canLive, emptyScan, type ScanState,
} from './views';

type Scene = 'intro' | 'scan' | 'confirm' | 'report' | 'market' | 'detail' | 'build' | 'send';
const SCENES: Scene[] = ['intro', 'scan', 'confirm', 'report', 'market', 'detail', 'build', 'send'];
const RAIL: { id: Scene; label: string }[] = [
  { id: 'intro', label: 'Meet' },
  { id: 'scan', label: 'Scan' },
  { id: 'confirm', label: 'About you' },
  { id: 'report', label: 'Your AI' },
  { id: 'market', label: 'Upgrades' },
  { id: 'build', label: 'Build' },
  { id: 'send', label: 'Send' },
];
const EXAMPLE_DOMAIN = 'harborlinehvac.com';
const TOOL_PHRASE: Record<ToolId, string> = {
  chatbot: 'a website chatbot', phone: 'AI phone answering', chatgpt: 'ChatGPT', booking: 'online booking',
  reviewsTool: 'review requests', emails: 'automated texts', none: 'no AI',
};

interface Snap {
  scene: Scene; example: boolean; manual: boolean; profile: Profile | null; draft: Profile | null; rec: RecommendResponse | null;
  added: ModuleType[]; moduleId: ModuleType | null; sent: { first: string } | null; scan: ScanState; detailMode: 'watch' | 'live';
}

const blankProfile = (): Profile => ({ name: '', industry: 'other', services: [], tools: [], detected: [], pains: [], themes: [], competitors: [] });
const reduceMotion = () => typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const shortName = (n: string) => n.replace(/\s+(Heating|&|and|LLC|Inc\.?|Co\.?|Company|Group|Services?)\b.*$/i, '').trim() || n;

/* share links: ?r=<base64url JSON> */
function encodeShare(data: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeShare(s: string): unknown {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder().decode(bytes));
}

function scanErrorText(code: string): string {
  if (code === 'invalid_url') return "That address doesn't look right. Check it and try again.";
  if (code === 'unreachable') return "I couldn't open that site. It may be down or blocking visitors.";
  if (code === 'blocked') return "That site blocks automated visitors, so I can't read it.";
  if (code === 'needs_app') return 'I can only read websites from here inside the Claude desktop app. Open this page there, or enter your details instead.';
  return 'Something went wrong while I was reading that site.';
}

export function PipApp() {
  const [scene, setScene] = useState<Scene>('intro');
  const [visits, setVisits] = useState<Record<Scene, number>>(() => Object.fromEntries(SCENES.map(s => [s, 0])) as Record<Scene, number>);
  const [visited, setVisited] = useState<Set<Scene>>(() => new Set<Scene>(['intro']));
  const [example, setExample] = useState(false);
  const [manual, setManual] = useState(false);
  const [source, setSource] = useState<DataSource | null>(null);
  const [scan, setScan] = useState<ScanState>(() => emptyScan());
  const [draft, setDraft] = useState<Profile | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [rec, setRec] = useState<RecommendResponse | null>(null);
  const [added, setAdded] = useState<ModuleType[]>([]);
  const [moduleId, setModuleId] = useState<ModuleType | null>(null);
  const [detailMode, setDetailMode] = useState<'watch' | 'live'>('watch');
  const [replayKey, setReplayKey] = useState(0);
  const [sent, setSent] = useState<{ first: string } | null>(null);
  const [shareState, setShareState] = useState<'idle' | 'copied' | 'manual'>('idle');
  const [shareUrl, setShareUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [mood, setMood] = useState<Mood>('idle');
  const [hop, setHop] = useState(0);
  const startRef = useRef<(url: string, ex?: boolean) => void>(() => {});
  const [speech, setSpeech] = useState<Speech>({
    id: 0, mood: 'happy', actions: [{ label: 'See an example first', onClick: () => startRef.current(EXAMPLE_DOMAIN, true) }],
    text: "Hi, I'm Pip. Give me your website and I'll find the AI your business is missing. Takes about a minute.",
  });

  const sid = useRef(0);
  const scanAbort = useRef<AbortController | null>(null);
  const chat = useRef<ChatTurn[]>([]);
  const lastSpeech = useRef<Speech | null>(null);
  const trayRef = useRef<HTMLButtonElement | null>(null);
  const lightRef = useRef<HTMLDivElement>(null);
  const S = useRef<Snap>({ scene, example, manual, profile, draft, rec, added, moduleId, sent, scan, detailMode });
  S.current = { scene, example, manual, profile, draft, rec, added, moduleId, sent, scan, detailMode };
  startRef.current = (u, ex) => { void startScan(u, ex); };

  /* ---------- speech ---------- */
  const say = useCallback((text: string, m: Mood, actions: Action[] = [], extra: Partial<Speech> = {}) => {
    const sp: Speech = { id: ++sid.current, text, mood: m, actions, ...extra };
    if (!extra.asked) lastSpeech.current = sp;
    setSpeech(sp);
  }, []);

  /* ---------- navigation ---------- */
  // Declared with function hoisting so action closures can reference each other.
  function enter(next: Scene, o: Partial<Snap> = {}) {
    const st = { ...S.current, ...o, scene: next };
    setScene(next);
    setVisits(v => ({ ...v, [next]: v[next] + 1 }));
    setVisited(v => (v.has(next) ? v : new Set(v).add(next)));
    if (next !== 'build') setShareState('idle');
    speakFor(st);
  }

  function speakFor(st: Snap) {
    const p = st.profile, r = st.rec;
    const they = st.example;
    switch (st.scene) {
      case 'intro':
        say("Hi, I'm Pip. Give me your website and I'll find the AI your business is missing. Takes about a minute.", 'happy',
          [{ label: 'See an example first', onClick: () => startScan(EXAMPLE_DOMAIN, true) }]);
        return;
      case 'scan': {
        const sc = st.scan;
        if (sc.error) {
          say(sc.error, 'idle', [
            { label: 'Enter details instead', primary: true, onClick: startManual },
            { label: 'Try another address', onClick: () => enter('intro') },
          ]);
        } else if (sc.done) {
          say(scanDoneText(sc, st.example) + dressLine(st.draft), 'happy', st.example ? [] : [{ label: 'Review what I found', primary: true, onClick: () => enter('confirm') }]);
        } else {
          say(`Reading ${sc.domain} now. Watch what I find.`, 'scan');
        }
        return;
      }
      case 'confirm':
        say(st.manual ? 'Tell me a little about your business. It takes about 20 seconds.'
          : "Here's what I found. Fix anything I got wrong, then tell me what eats your week.", 'present');
        return;
      case 'report': {
        if (!p || !r) { enter('intro'); return; }
        const neg = p.themes.filter(t => t.sentiment === 'negative').sort((a, b) => b.count - a.count)[0];
        const haveAny = r.report.have.length > 0;
        let text: string;
        if (they) {
          text = `This is ${p.name}. They already use ${haveAny ? r.report.have.map(h => TOOL_PHRASE[h.tool]).join(' and ') : 'some AI'}, and still score ${r.report.score} out of 100.`
            + (neg ? ` ${neg.count} of their reviews mention ${neg.label.toLowerCase()}.` : '');
        } else {
          text = p.kit?.say?.report || r.report.insight || `Your score is ${r.report.score}. The biggest gap is ${AREAS[r.report.gap].toLowerCase()}.`;
          if (r.report.competitorNote && !r.report.insight && !p.kit?.say?.report) text += ` ${r.report.competitorNote}`;
        }
        say(text, 'present', [{ label: they ? 'See what they could add' : 'See my upgrades', primary: true, onClick: () => enter('market') }]);
        return;
      }
      case 'market': {
        if (!p || !r) { enter('intro'); return; }
        const top = r.modules[0];
        const acts: Action[] = [{ label: `Review ${they ? 'the' : 'my'} build`, primary: true, onClick: () => enter('build') }];
        if (top && canLive(top)) acts.push({ label: `Try ${top.name} live`, onClick: () => openModule(top.type, 'live') });
        say(`${(!they && p.kit?.say?.market) || `These are ranked for ${shortName(p.name)}.`} I added my top two picks. Tap any card to watch it work.`, 'present', acts);
        return;
      }
      case 'detail': {
        const m = r?.modules.find(x => x.type === st.moduleId);
        if (!p || !m) { enter('market'); return; }
        const on = st.added.includes(m.type);
        const acts: Action[] = [
          { label: on ? 'Remove from build' : 'Add to build', primary: !on, onClick: () => { toggle(m.type); } },
          { label: 'Back to upgrades', primary: on, onClick: () => enter('market') },
        ];
        if (st.detailMode === 'live' && canLive(m)) {
          say(`You're the customer now. Text ${shortName(p.name)} anything. It answers with what I learned about ${they ? 'them' : 'you'}.`, 'present', acts);
        } else {
          say(TYPES[m.type].pip + (canLive(m) ? ' Tap "Try it live" to text it yourself.' : ''), 'present', acts);
        }
        return;
      }
      case 'build': {
        if (!p || !r) { enter('intro'); return; }
        if (!st.added.length) {
          say('Your build is empty. Pick a few upgrades first.', 'idle', [{ label: 'Back to upgrades', primary: true, onClick: () => enter('market') }]);
          return;
        }
        say(`${(!they && p.kit?.say?.build) || `${st.added.length} ${st.added.length === 1 ? 'upgrade' : 'upgrades'}, built around ${shortName(p.name)}.`} Ready in about a day, and a person checks everything before it goes live.`, 'happy', [
          { label: they ? 'Send me a build like this' : 'Send me my build', primary: true, onClick: () => enter('send') },
          { label: 'Add more', onClick: () => enter('market') },
        ]);
        return;
      }
      case 'send':
        if (st.sent) {
          say(`Sent! Talk soon, ${st.sent.first}.`, 'happy', [{ label: 'Scan another business', onClick: restart }]);
        } else {
          say('Where should I send it? A real person on our team reviews every build.', 'idle');
        }
        return;
    }
  }

  function dressLine(d: Profile | null | undefined): string {
    const o = outfitFor(d);
    return o === 'none' ? '' : ` I put on ${OUTFIT_LABEL[o]} for this one.`;
  }

  function scanDoneText(sc: ScanState, ex: boolean): string {
    const bits: string[] = [`I read ${sc.pages.length} pages`];
    if (sc.tech.length) bits.push(`found ${sc.tech.length === 1 ? 'one tool already in use' : `${sc.tech.length} tools already in use`}`);
    if (sc.reviews) bits.push(`pulled the Google rating from ${sc.reviews.count} reviews`);
    const list = bits.length > 1 ? `${bits.slice(0, -1).join(', ')}, and ${bits[bits.length - 1]}` : bits[0];
    return ex ? `${list}. Building their report now.` : `Done. ${list}. Check that I got it right.`;
  }

  /* ---------- scan ---------- */
  async function startScan(url: string, isExample = false) {
    scanAbort.current?.abort();
    const ac = new AbortController();
    scanAbort.current = ac;
    const domain = url.trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/.*$/, '').toLowerCase();
    let sc = emptyScan(domain);
    chat.current = [];
    setExample(isExample); setManual(false); setSource(null); setProfile(null); setRec(null); setAdded([]); setSent(null); setModuleId(null);
    setVisited(new Set<Scene>(['intro', 'scan']));
    setScan(sc);
    enter('scan', { scan: sc, example: isExample, manual: false, profile: null, rec: null, added: [], sent: null });
    const update = (fn: (s: ScanState) => ScanState) => { sc = fn(sc); setScan(sc); };
    const here = () => !ac.signal.aborted && S.current.scene === 'scan';

    const onEvent = (e: ScanEvent) => {
      if (ac.signal.aborted) return;
      switch (e.type) {
        case 'meta': setSource(e.source); break;
        case 'status': update(s => ({ ...s, status: e.message, progress: Math.max(s.progress, e.progress) })); break;
        case 'page': update(s => ({ ...s, pages: [...s.pages, { url: e.url, title: e.title }].slice(-8) })); break;
        case 'fact': update(s => ({ ...s, facts: [...s.facts.filter(f => f.key !== e.key), { key: e.key, label: e.label, value: e.value }] })); break;
        case 'tech': update(s => ({ ...s, tech: [...s.tech, { tool: e.tool, label: e.label }] })); break;
        case 'reviews': {
          update(s => ({ ...s, reviews: { rating: e.rating, count: e.count, themes: e.themes } }));
          const neg = e.themes.filter(t => t.sentiment === 'negative').sort((a, b) => b.count - a.count)[0];
          if (here()) say(`${e.rating.toFixed(1)} stars from ${e.count} reviews.${neg ? ` ${neg.count} of ${e.sample ? `the latest ${e.sample}` : 'them'} mention ${neg.label.toLowerCase()}. Noted.` : ''}`, neg ? 'wow' : 'happy');
          break;
        }
        case 'competitor': update(s => ({ ...s, competitors: [...s.competitors, e.competitor].slice(0, 4) })); break;
        case 'done': {
          update(s => ({ ...s, done: true, progress: 100, status: 'Done' }));
          setSource(e.source);
          const p: Profile = { ...e.profile, tools: e.profile.tools.length ? e.profile.tools : ['none'] };
          setDraft(p);
          if (here()) speakFor({ ...S.current, scene: 'scan', scan: sc, example: isExample, draft: p });
          if (isExample) {
            setTimeout(() => { if (here()) void showReport({ ...p, pains: ['leads'] }, true); }, reduceMotion() ? 200 : 2600);
          }
          break;
        }
        case 'error':
          update(s => ({ ...s, error: scanErrorText(e.code || 'internal') }));
          if (here()) speakFor({ ...S.current, scene: 'scan', scan: sc });
          break;
      }
    };

    try {
      await scanSite(url, onEvent, ac.signal);
      if (!ac.signal.aborted && !sc.done && !sc.error) {
        update(s => ({ ...s, error: scanErrorText('internal') }));
        speakFor({ ...S.current, scene: 'scan', scan: sc });
      }
    } catch (err) {
      if (ac.signal.aborted) return;
      update(s => ({ ...s, error: scanErrorText(err instanceof ApiError ? err.code : 'internal') }));
      speakFor({ ...S.current, scene: 'scan', scan: sc });
    }
  }

  function startManual() {
    scanAbort.current?.abort();
    const p = blankProfile();
    setManual(true); setExample(false); setDraft(p); setSource(null); setProfile(null); setRec(null); setAdded([]); setSent(null);
    setVisited(new Set<Scene>(['intro', 'confirm']));
    enter('confirm', { manual: true, example: false, profile: null, rec: null });
  }

  /* ---------- report ---------- */
  async function showReport(p: Profile, isExample = S.current.example) {
    setBusy(true);
    say(isExample ? `Building ${shortName(p.name)}'s report…` : 'Building your report…', 'think');
    try {
      const r = await getRecommendations(p);
      const picks = r.modules.slice(0, 2).map(m => m.type);
      setProfile(p); setDraft(p); setRec(r); setAdded(picks); setSource(r.source);
      setVisited(v => { const n = new Set(v); (['report', 'market', 'build', 'send'] as Scene[]).forEach(s => n.add(s)); return n; });
      enter('report', { profile: p, rec: r, added: picks, example: isExample });
    } catch {
      say("I couldn't build the report just now.", 'idle', [{ label: 'Try again', primary: true, onClick: () => showReport(p, isExample) }]);
    } finally {
      setBusy(false);
    }
  }

  /* ---------- marketplace ---------- */
  function toggle(t: ModuleType, from?: HTMLElement | null) {
    const cur = S.current.added;
    const on = cur.includes(t);
    const next = on ? cur.filter(x => x !== t) : [...cur, t];
    setAdded(next);
    if (!on) {
      setHop(h => h + 1);
      flyToTray(from);
    }
    if (S.current.scene === 'detail') speakFor({ ...S.current, added: next, scene: 'detail' });
    else if (S.current.scene === 'market') {
      const name = TYPES[t].name;
      say(on ? `Removed ${name}.` : `${name} added. ${next.length} in the build.`, on ? 'idle' : 'happy', lastSpeech.current?.actions || []);
    }
  }

  function flyToTray(from?: HTMLElement | null) {
    const tray = trayRef.current;
    if (!tray) return;
    const bump = () => { tray.classList.remove('bump'); void tray.offsetWidth; tray.classList.add('bump'); };
    if (!from || reduceMotion()) { bump(); return; }
    const a = from.getBoundingClientRect(), b = tray.getBoundingClientRect();
    const fly = from.cloneNode(true) as HTMLElement;
    fly.classList.add('flyer');
    Object.assign(fly.style, { position: 'fixed', left: `${a.left}px`, top: `${a.top}px`, width: `${a.width}px`, height: `${a.height}px`, margin: '0', zIndex: '60', pointerEvents: 'none' });
    document.body.appendChild(fly);
    const dx = b.left + 18 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
    const anim = fly.animate([
      { transform: 'translate(0,0) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(.8)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(.35)`, opacity: 0.2 },
    ], { duration: 700, easing: 'cubic-bezier(.5,0,.3,1)' });
    anim.onfinish = () => { fly.remove(); bump(); };
  }

  function openModule(t: ModuleType, mode: 'watch' | 'live' = 'watch') {
    const m = S.current.rec?.modules.find(x => x.type === t);
    const md = m && canLive(m) ? mode : 'watch';
    setModuleId(t); setDetailMode(md); setReplayKey(k => k + 1);
    enter('detail', { moduleId: t, detailMode: md });
  }

  function setMode(md: 'watch' | 'live') {
    setDetailMode(md);
    speakFor({ ...S.current, detailMode: md, scene: 'detail' });
  }

  function onLiveReply() {
    const st = S.current;
    const m = st.rec?.modules.find(x => x.type === st.moduleId);
    if (!st.profile || !m) return;
    const on = st.added.includes(m.type);
    say(`That's ${st.example ? `${shortName(st.profile.name)}'s` : 'your'} ${m.name} answering, using ${st.example ? 'their' : 'your'} hours and services.${on ? ' It’s already in the build.' : ' Add it to the build?'}`, 'wow', [
      ...(on ? [] : [{ label: 'Add to build', primary: true, onClick: () => toggle(m.type) }]),
      { label: 'Back to upgrades', primary: on, onClick: () => enter('market') },
    ]);
  }

  /* ---------- build + send ---------- */
  async function share() {
    const st = S.current;
    if (!st.profile) return;
    const url = `${location.origin}${location.pathname}?r=${encodeShare({ p: st.profile, a: st.added, x: st.example })}`;
    setShareUrl(url);
    try {
      await navigator.clipboard.writeText(url);
      setShareState('copied');
      say('Link copied. Anyone with it sees this report and build.', 'happy', lastSpeech.current?.actions || []);
    } catch {
      setShareState('manual');
    }
  }

  async function send(name: string, contact: string): Promise<string | null> {
    const st = S.current;
    if (!st.profile) return 'Something went wrong. Start over and try again.';
    say('Sending…', 'think');
    try {
      const r = await submitLead(name, contact, st.profile, st.added);
      if (!r.ok) throw new Error(r.error);
      const first = name.split(/\s+/)[0];
      setSent({ first });
      setHop(h => h + 1);
      speakFor({ ...st, sent: { first }, scene: 'send' });
      return null;
    } catch {
      speakFor({ ...st, scene: 'send' });
      return "That didn't send. Check your details and try again.";
    }
  }

  function restart() {
    scanAbort.current?.abort();
    chat.current = [];
    setExample(false); setManual(false); setSource(null); setProfile(null); setRec(null); setAdded([]); setSent(null); setDraft(null); setModuleId(null);
    setScan(emptyScan());
    setVisited(new Set<Scene>(['intro']));
    if (location.search) history.replaceState(null, '', location.pathname);
    enter('intro', { example: false, manual: false, profile: null, rec: null, added: [], sent: null });
  }

  /* ---------- ask Pip ---------- */
  async function ask(q: string) {
    const st = S.current;
    const back = lastSpeech.current;
    chat.current = [...chat.current, { role: 'user' as const, content: q }].slice(-12);
    say('Let me think…', 'think', [], { asked: q, instant: true });
    try {
      const r = await askPip(chat.current, st.profile, st.added);
      chat.current = [...chat.current, { role: 'assistant' as const, content: r.reply }].slice(-12);
      say(r.reply, back?.mood === 'scan' ? 'idle' : back?.mood || 'idle', back?.actions || [], { asked: q });
    } catch {
      chat.current = chat.current.slice(0, -1);
      say("I couldn't answer that just now. Try again in a moment.", 'idle', back?.actions || [], { asked: q });
    }
  }

  /* ---------- rail ---------- */
  function goRail(id: Scene) {
    if (!visited.has(id) || id === scene) return;
    if (id === 'intro') { enter('intro'); return; }
    if (id === 'scan') { enter('scan'); return; }
    enter(id);
  }

  /* ---------- shared-link restore ---------- */
  useEffect(() => {
    const r = new URLSearchParams(location.search).get('r');
    if (!r) return;
    let data: { p?: unknown; a?: unknown; x?: unknown };
    try { data = decodeShare(r) as typeof data; } catch { return; }
    const p = sanitizeProfile(data?.p);
    if (!p) return;
    const want = Array.isArray(data.a) ? data.a.filter(isModuleType) : [];
    const isEx = data.x === true;
    (async () => {
      try {
        const rr = await getRecommendations(p);
        const keep = want.filter(t => rr.modules.some(m => m.type === t));
        setExample(isEx); setProfile(p); setDraft(p); setRec(rr); setAdded(keep); setSource(rr.source);
        setVisited(new Set<Scene>(['intro', 'report', 'market', 'build', 'send', ...(isEx ? [] : ['confirm'] as Scene[])]));
        setScene('report'); setVisits(v => ({ ...v, report: v.report + 1 }));
        say(`This build for ${shortName(p.name)} was shared with you. Here's the report it started from.`, 'present', [
          { label: 'See the build', primary: true, onClick: () => enter('build') },
          { label: 'See all upgrades', onClick: () => enter('market') },
        ]);
      } catch { /* fall back to the intro */ }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- glass light + tilt ---------- */
  useEffect(() => {
    const fine = matchMedia('(pointer: fine)').matches;
    if (!fine || reduceMotion()) return;
    let raf = 0, x = -1000, y = -1000;
    let tilted: HTMLElement | null = null;
    const frame = () => {
      raf = 0;
      if (lightRef.current) { lightRef.current.style.transform = `translate(${x}px, ${y}px)`; lightRef.current.classList.add('on'); }
      document.querySelectorAll<HTMLElement>('.glass, .is-active .glass-lite').forEach(el => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--lx', `${x - r.left}px`);
        el.style.setProperty('--ly', `${y - r.top}px`);
      });
    };
    const move = (e: PointerEvent) => {
      x = e.clientX; y = e.clientY;
      if (!raf) raf = requestAnimationFrame(frame);
      const t = (e.target as HTMLElement | null)?.closest?.('[data-tilt]') as HTMLElement | null;
      if (tilted && tilted !== t) { tilted.style.transform = ''; tilted = null; }
      if (t) {
        const r = t.getBoundingClientRect(), k = Number(t.dataset.tilt) || 6;
        const rx = ((y - r.top) / r.height - 0.5) * -k, ry = ((x - r.left) / r.width - 0.5) * k;
        t.style.transform = `perspective(900px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(0)`;
        tilted = t;
      }
    };
    const leave = () => { lightRef.current?.classList.remove('on'); if (tilted) { tilted.style.transform = ''; tilted = null; } };
    document.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => { document.removeEventListener('pointermove', move); document.documentElement.removeEventListener('pointerleave', leave); cancelAnimationFrame(raf); };
  }, []);

  /* ---------- keyboard ---------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && S.current.scene === 'detail') { e.preventDefault(); enter('market'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ---------- render ---------- */
  const railCurrent: Scene = scene === 'detail' ? 'market' : scene;
  const mod = rec?.modules.find(m => m.type === moduleId) || null;
  const view = (id: Scene, cls = '') => ({
    className: `view v-${id}${cls ? ` ${cls}` : ''}${scene === id ? ' is-active' : ''}`,
    'aria-hidden': scene !== id,
    inert: scene !== id,
  });

  return (
    <>
      <div className="aurora" aria-hidden="true"><span className="blob b1" /><span className="blob b2" /><span className="blob b3" /></div>
      <div className="cursor-light" ref={lightRef} aria-hidden="true" />
      <div className="app">
        <header className="top">
          <div className="brand"><span className="logo-orb" aria-hidden="true" /><span className="logo-text">{BRAND}</span></div>
          <nav aria-label="Steps">
            <ol className="rail glass">
              {RAIL.map(r => (
                <li key={r.id}>
                  <button type="button" aria-current={railCurrent === r.id ? 'step' : undefined} className={visited.has(r.id) ? 'seen' : ''}
                    disabled={!visited.has(r.id) || busy} onClick={() => goRail(r.id)} aria-label={r.label}>
                    <i aria-hidden="true" /><span>{r.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
          <button type="button" className="icon-btn" aria-label="Start over" title="Start over" onClick={restart}><Replay /></button>
        </header>

        <main className="stage">
          <aside className="dock" aria-label="Pip">
            <Pip mood={mood} hopKey={hop} outfit={outfitFor(profile ?? draft)} onPoke={() => { setHop(h => h + 1); }} />
            <Bubble speech={speech} setMood={setMood} onAsk={ask} askEnabled={!['intro', 'scan'].includes(scene) && !busy} />
          </aside>

          <section className="work glass">
            <div className="work-dots" aria-hidden="true" />

            <div {...view('intro')}>
              <IntroView key={visits.intro} onScan={u => startScan(u)} onManual={startManual} busy={busy} />
            </div>

            <div {...view('scan')}>
              <ScanView scan={scan} source={source} />
            </div>

            <div {...view('confirm')}>
              {draft && <ConfirmView key={`${visits.confirm}-${draft.name}`} draft={draft} manual={manual} source={source} onSubmit={p => showReport(p, false)} />}
            </div>

            <div {...view('report')}>
              {profile && rec && <ReportView key={visits.report} profile={profile} rec={rec} example={example} />}
            </div>

            <div {...view('market')}>
              {profile && rec && (
                <MarketView key={visits.market} profile={profile} modules={rec.modules} added={added} source={rec.source}
                  onOpen={t => openModule(t)} onToggle={toggle} onTray={() => enter('build')} trayRef={trayRef} />
              )}
            </div>

            <div {...view('detail')}>
              {profile && mod && (
                <DetailView key={`${visits.detail}-${mod.type}`} profile={profile} module={mod} onBack={() => enter('market')}
                  mode={detailMode} setMode={setMode} onLiveReply={onLiveReply} replayKey={replayKey} onReplay={() => setReplayKey(k => k + 1)} />
              )}
            </div>

            <div {...view('build')}>
              {profile && rec && <BuildView key={visits.build} profile={profile} modules={rec.modules} added={added} onShare={share} shareState={shareState} shareUrl={shareUrl} />}
            </div>

            <div {...view('send')}>
              {profile && rec && <SendView key={visits.send} profile={profile} modules={rec.modules} added={added} sent={sent} onSend={send} example={example} />}
            </div>
          </section>
        </main>
      </div>
    </>
  );
}
