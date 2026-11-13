import { useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/icons';
import type { Mood } from '@/components/Pip';
import { BLOCKS } from '@/lib/skills/blocks';
import { compileSpec, setupQuestions, type SetupQuestion } from '@/lib/skills/compile';
import { quote, TIERS, type Quote } from '@/lib/skills/pricing';
import { runTests, runTurn, type ActionResult, type Brain, type Msg, type TestResult } from '@/lib/skills/runtime';
import type { SkillSpec, Validation } from '@/lib/skills/spec';
import { brainFrom, loadSetup, runtimeLlm, saveSetup, SERVER } from './brain';
import type { Brief, Skill } from './types';

type Phase = 'ask' | 'answer' | 'build' | 'try' | 'approved';
interface Built {
  skillId: string; name: string;
  state: 'waiting' | 'compiling' | 'testing' | 'passed' | 'needs_review';
  attempt: number; note?: string;
  spec?: SkillSpec; tier?: 1 | 2 | 3; waitingOn?: Validation['waitingOn']; tests?: TestResult[];
}
interface Setup { brain: Brain; questions: SetupQuestion[]; built: Built[]; quote?: Quote; approvedAt?: string }

const MAX_TRIES = 3;
const ACTION_LABEL: Record<string, string> = { capture_lead: 'Lead saved', request_booking: 'Time requested', notify_owner: 'Owner alerted', handoff: 'Handed to a person', draft_for_approval: 'Draft for the owner' };

export function SetupSlide({ brief, chosen, speak, onDone }: { brief: Brief; chosen: Skill[]; speak: (t: string, m?: Mood) => void; onDone: () => void }) {
  const domain = brief.domain || brief.und.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const [phase, setPhase] = useState<Phase>('ask');
  const [setup, setSetup] = useState<Setup | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [err, setErr] = useState('');
  const [tryId, setTryId] = useState<string | null>(null);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);

  /* load a saved setup, or ask Pip's questions */
  useEffect(() => {
    (async () => {
      const saved = await loadSetup<Setup>(domain);
      if (saved && saved.built?.length && saved.built.every(b => chosen.some(c => c.id === b.skillId))) {
        setSetup(saved);
        setAnswers(Object.fromEntries(saved.brain.qa.map((x, i) => [saved.questions[i]?.id || String(i), x.a])));
        setPhase(saved.approvedAt ? 'approved' : saved.built.some(b => b.state === 'passed') ? 'try' : 'answer');
        return;
      }
      const brain = brainFrom(brief);
      speak(`Before I build, I need a few answers only you know. It takes about two minutes.`, 'think');
      try {
        const qs = await setupQuestions(runtimeLlm, brain, chosen.map(c => ({ name: c.name, tagline: c.tagline, how: c.how })));
        if (!live.current) return;
        if (!qs.length) throw new Error('no_questions');
        setSetup({ brain, questions: qs, built: [] });
        setPhase('answer');
        speak(`${qs.length} quick questions. Your answers become the knowledge your skills use, so be specific.`, 'present');
      } catch {
        if (!live.current) return;
        setErr("I couldn't write the setup questions. Try again in a moment.");
        speak("That didn't work this time. Press Try again.", 'idle');
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const update = (fn: (s: Setup) => Setup) => setSetup(s => (s ? fn(s) : s));
  const mark = (id: string, patch: Partial<Built>) => update(s => ({ ...s, built: s.built.map(b => (b.skillId === id ? { ...b, ...patch } : b)) }));

  /* compile -> validate -> test, retrying with the problems, up to 3 times per skill */
  async function build() {
    if (!setup) return;
    const qa = setup.questions.map(q => ({ q: q.q, a: (answers[q.id] || '').trim() }));
    const brain: Brain = { ...setup.brain, qa };
    const built: Built[] = chosen.map(c => ({ skillId: c.id, name: c.name, state: 'waiting', attempt: 0 }));
    let next: Setup = { ...setup, brain, built };
    setSetup(next); setPhase('build'); setErr('');
    speak(`Building ${chosen.length === 1 ? 'your skill' : `your ${chosen.length} skills`} now. Each one gets written, checked, and tested against real customer messages.`, 'think');
    for (const c of chosen) {
      let fix: Parameters<typeof compileSpec>[3];
      let final: Partial<Built> = { state: 'needs_review', note: 'Sent to the team for a look' };
      for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
        if (!live.current) return;
        mark(c.id, { state: 'compiling', attempt });
        let v: Validation;
        try { v = await compileSpec(runtimeLlm, { name: c.name, tagline: c.tagline, why: c.why, how: c.how, category: c.category, demo: c.demo }, brain, fix); }
        catch { final = { state: 'needs_review', note: 'Pip ran out of thinking time. Try again later.' }; break; }
        if (!v.spec) { fix = { errors: v.errors, failed: [], previous: null }; continue; }
        if (!v.ok) { fix = { errors: v.errors, failed: [], previous: v.spec }; continue; }
        mark(c.id, { state: 'testing', spec: v.spec, tier: v.tier, waitingOn: v.waitingOn, tests: [] });
        const results = await runTests(v.spec, brain, runtimeLlm, (r) => live.current && mark(c.id, { tests: undefined, note: `${r.pass ? 'Passed' : 'Missed'}: "${r.test.say.slice(0, 40)}"` }));
        const failed = results.filter(r => !r.pass);
        final = { spec: v.spec, tier: v.tier, waitingOn: v.waitingOn, tests: results, state: failed.length ? 'needs_review' : 'passed', note: failed.length ? `${failed.length} of ${results.length} tests still failing after ${attempt} ${attempt === 1 ? 'try' : 'tries'}` : `All ${results.length} tests passed` };
        if (!failed.length) break;
        fix = { errors: [], failed, previous: v.spec };
      }
      mark(c.id, final);
      next = { ...next, built: next.built.map(b => (b.skillId === c.id ? { ...b, ...final } as Built : b)) };
    }
    const passed = next.built.filter(b => b.state === 'passed');
    next = { ...next, quote: quote(passed.map(b => ({ name: b.name, tier: b.tier || 1 }))) };
    setSetup(next);
    void saveSetup(domain, next);
    if (!live.current) return;
    setPhase('try');
    setTryId(passed[0]?.skillId || null);
    speak(passed.length
      ? `${passed.length} of ${chosen.length} passed every test. Try ${passed.length === 1 ? 'it' : 'them'} for real below, then approve.`
      : `None passed all their tests yet, so I've sent them to the team instead of guessing.`, passed.length ? 'happy' : 'idle');
  }

  function approve() {
    if (!setup) return;
    const s = { ...setup, approvedAt: new Date().toISOString() };
    setSetup(s); void saveSetup(domain, s); setPhase('approved');
    speak('Approved. Your skills are ready to switch on. The team activates them and sends your install line.', 'happy');
  }

  if (err) return <div className="sl sl-setup"><p className="sl-eye">Set up</p><div className="err-box"><p>{err}</p><button type="button" className="dk-btn" onClick={() => location.reload()}>Try again</button></div></div>;
  if (!setup) return (
    <div className="sl sl-setup"><p className="sl-eye">Set up</p><h2 className="sl-h2">Writing your setup questions</h2>
      <ul className="pfeed"><li className="pop thinking"><span className="f-ico"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span></span><span><b>Reading your skills and your business</b><em>About 20 seconds</em></span></li></ul></div>
  );

  const passed = setup.built.filter(b => b.state === 'passed');
  return (
    <div className="sl sl-setup">
      <p className="sl-eye">Set up · {brief.und.name}</p>
      <ol className="setup-steps" aria-label="Setup progress">
        {(['Teach Pip', 'Build & test', 'Try it', 'Approve'] as const).map((l, i) => {
          const at = { answer: 0, ask: 0, build: 1, try: 2, approved: 3 }[phase];
          return <li key={l} className={i < at ? 'done' : i === at ? 'on' : ''}><span>{i + 1}</span>{l}</li>;
        })}
      </ol>

      {phase === 'answer' && (
        <form className="qa" onSubmit={e => { e.preventDefault(); void build(); }}>
          <h2 className="sl-h2">Teach Pip what only you know</h2>
          {setup.questions.map(q => (
            <div key={q.id} className="mf wide">
              <label htmlFor={`q-${q.id}`}>{q.q}{q.why && <em> · {q.why}</em>}</label>
              <textarea id={`q-${q.id}`} rows={2} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} placeholder={q.example} maxLength={600} />
            </div>
          ))}
          <div className="mf-row"><button className="dk-btn big" type="submit" disabled={setup.questions.filter(q => (answers[q.id] || '').trim()).length < Math.min(3, setup.questions.length)}>Build my skills →</button><span className="sl-sub">Answer at least 3. Blank ones are left out.</span></div>
        </form>
      )}

      {phase !== 'answer' && (
        <>
          <ul className="built">
            {setup.built.map(b => (
              <li key={b.skillId} className={b.state}>
                <span className="b-state" aria-hidden="true">{b.state === 'passed' ? '✓' : b.state === 'needs_review' ? '!' : b.state === 'waiting' ? '·' : <span className="typing-dots"><i /><i /><i /></span>}</span>
                <div>
                  <b>{b.name}</b>
                  <p>{b.state === 'compiling' ? `Writing the spec${b.attempt > 1 ? `, try ${b.attempt} of ${MAX_TRIES}` : ''}` : b.state === 'testing' ? `Testing: ${b.note || 'running customer conversations'}` : b.state === 'waiting' ? 'Waiting' : b.note}</p>
                  {!!b.waitingOn?.length && <p className="wait">Needs before going live: {b.waitingOn.map(w => w.setup || w.label).join(' · ')}</p>}
                  {b.tests && b.tests.length > 0 && (b.state === 'passed' || b.state === 'needs_review') && (
                    <details><summary>See the {b.tests.length} test conversations</summary>
                      <ul className="tests">{b.tests.map((t, i) => <li key={i} className={t.pass ? 'ok' : 'bad'}><b>{t.pass ? 'Pass' : 'Miss'}</b> Customer: “{t.test.say}” <br />Skill: “{t.reply}”{!t.pass && t.missed.length > 0 && <em> Missed: {t.missed.join('; ')}</em>}</li>)}</ul>
                    </details>
                  )}
                </div>
                {b.state === 'passed' && phase === 'try' && <button type="button" className={`dk-btn${tryId === b.skillId ? '' : ' ghost'}`} onClick={() => setTryId(b.skillId)}>Try it</button>}
              </li>
            ))}
          </ul>

          {phase === 'try' && tryId && (() => { const b = setup.built.find(x => x.skillId === tryId); return b?.spec ? <Sandbox key={tryId} spec={b.spec} brain={setup.brain} /> : null; })()}

          {(phase === 'try' || phase === 'approved') && setup.quote && passed.length > 0 && (
            <div className="quote">
              <span className="sl-eye">Your plan</span>
              <table><tbody>
                {setup.quote.lines.map(l => <tr key={l.name}><td>{l.name}</td><td>{l.tierName}</td><td className="num">${l.price}/mo</td></tr>)}
                {setup.quote.discount > 0 && <tr className="disc"><td colSpan={2}>Bundle discount</td><td className="num">−${setup.quote.discount}</td></tr>}
                <tr className="tot"><td colSpan={2}>After your free {setup.quote.pilotDays}-day pilot</td><td className="num">${setup.quote.monthly}/mo</td></tr>
              </tbody></table>
              <p className="sl-sub">The pilot covers up to {setup.quote.pilotSkills} skills free for {setup.quote.pilotDays} days. Includes {Array.from(new Set(setup.quote.lines.map(l => TIERS[l.tier].included))).join(', ')} per skill. Cancel anytime.</p>
              {phase === 'try' && <button type="button" className="dk-btn big" onClick={approve}>Approve and start my pilot →</button>}
            </div>
          )}

          {phase === 'approved' && (
            <div className="install">
              <span className="sl-eye">Install</span>
              <p>Once the team switches your skills on, this one line goes on your website, just before <code>&lt;/body&gt;</code>. Your web person can paste it in a minute.</p>
              <pre><code>{`<script src="${SERVER}/widget.js" data-skill="YOUR-SKILL-ID" async></script>`}</code></pre>
              <p className="sl-sub">Your skill ID arrives with your activation message.</p>
              <button type="button" className="dk-btn" onClick={onDone}>Next: send it to the team →</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* the owner talks to the real compiled skill, with its real actions shown */
function Sandbox({ spec, brain }: { spec: SkillSpec; brain: Brain }) {
  const [msgs, setMsgs] = useState<(Msg & { actions?: ActionResult[] })[]>([]);
  const [v, setV] = useState('');
  const [busy, setBusy] = useState(false);
  const feed = useRef<HTMLDivElement>(null);
  useEffect(() => { feed.current?.scrollTo({ top: feed.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  async function send(text: string) {
    const t = text.trim().slice(0, 500);
    if (!t || busy) return;
    const h = [...msgs, { role: 'user' as const, content: t }];
    setMsgs(h); setV(''); setBusy(true);
    try {
      const turn = await runTurn({ spec, brain, history: msgs.map(m => ({ role: m.role, content: m.content })), message: t, llm: runtimeLlm });
      setMsgs([...h, { role: 'assistant', content: turn.reply, actions: turn.actions }]);
    } catch { setMsgs([...h, { role: 'assistant', content: "That reply didn't come through. Send it again." }]); }
    finally { setBusy(false); }
  }
  const open = spec.agent.opener;
  return (
    <div className="pdemo chat sandbox">
      <p className="demo-cap">Sandbox · the real {spec.name}, running on your answers</p>
      <div className="chat-feed" ref={feed}>
        {open && <p className="bub them">{open}</p>}
        {!open && !msgs.length && <p className="chat-empty">Write as a customer would.</p>}
        {msgs.map((m, i) => (
          <div key={i} className={`turn ${m.role}`}>
            <p className={`bub ${m.role === 'user' ? 'me' : 'them'}`}>{m.content}</p>
            {!!m.actions?.length && <div className="acts">{m.actions.map((a, j) => <span key={j} className={`act-chip ${a.status}`}><Icon name={a.status === 'blocked' ? 'chip' : 'check'} />{ACTION_LABEL[a.tool] || BLOCKS[a.tool].label}{a.status === 'waiting_for_owner' ? ' · waits for you' : a.status === 'blocked' ? ' · not connected yet' : ''}</span>)}</div>}
          </div>
        ))}
        {busy && <p className="bub them"><span className="typing-dots" aria-hidden="true"><i /><i /><i /></span><span className="sr-only">Typing</span></p>}
      </div>
      {!msgs.length && spec.tests[0] && <button type="button" className="sug" onClick={() => void send(spec.tests[0].say)}>{spec.tests[0].say}</button>}
      <form className="chat-in" onSubmit={e => { e.preventDefault(); void send(v); }}>
        <label className="sr-only" htmlFor="sb-in">Message</label>
        <input id="sb-in" value={v} onChange={e => setV(e.target.value)} placeholder="Type as a customer…" maxLength={500} autoComplete="off" />
        <button type="submit" className="dk-btn" disabled={!v.trim() || busy}>Send</button>
      </form>
    </div>
  );
}
