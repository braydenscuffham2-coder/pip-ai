'use client';
import { useEffect, useRef, useState } from 'react';
import { Arrow, Up } from './icons';
import type { Mood } from './Pip';

export interface Action { label: string; primary?: boolean; onClick: () => void; id?: string }
export interface Speech { id: number; text: string; mood: Mood; actions: Action[]; asked?: string; instant?: boolean }

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export function Bubble({ speech, setMood, onAsk, askEnabled }: {
  speech: Speech;
  setMood: (m: Mood) => void;
  onAsk: (q: string) => void;
  askEnabled: boolean;
}) {
  const [shown, setShown] = useState(speech.text);
  const [typing, setTyping] = useState(false);
  const [ready, setReady] = useState(true);
  const [q, setQ] = useState('');
  const skip = useRef(false);
  const actionsRef = useRef<HTMLDivElement>(null);
  const askRef = useRef<HTMLInputElement>(null);
  const setMoodRef = useRef(setMood);
  setMoodRef.current = setMood;

  useEffect(() => {
    let cancelled = false;
    skip.current = false;
    const text = speech.text;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (speech.instant || reduce) {
      setShown(text); setTyping(false); setReady(true); setMoodRef.current(speech.mood);
      return;
    }
    setReady(false); setTyping(true); setShown(''); setMoodRef.current('talk');
    (async () => {
      for (let i = 1; i <= text.length; i++) {
        if (cancelled) return;
        if (skip.current) { setShown(text); break; }
        setShown(text.slice(0, i));
        const ch = text[i - 1];
        await sleep(ch === ' ' ? 13 : /[.,!?…]/.test(ch) ? 105 : 18);
      }
      if (cancelled) return;
      setTyping(false); setReady(true); setMoodRef.current(speech.mood);
    })();
    return () => { cancelled = true; };
  }, [speech.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!ready) return;
    const p = actionsRef.current?.querySelector<HTMLButtonElement>('.act.primary');
    const ae = document.activeElement as HTMLElement | null;
    if (p && ae !== askRef.current && (!ae || ae === document.body || ae.closest('.dock') || ae.closest('.rail'))) p.focus({ preventScroll: true });
  }, [ready, speech.id]);

  return (
    <div className="bubble glass" onClick={e => { if (!(e.target as HTMLElement).closest('button, input, form')) skip.current = true; }}>
      <span className="tail" aria-hidden="true" />
      <p className="b-name"><i />Pip <em>· your guide</em></p>
      {speech.asked && <p className="asked">You asked: {speech.asked}</p>}
      <p className={`say${typing ? ' typing' : ''}`} aria-hidden="true">{shown}</p>
      <p className="sr-only" aria-live="polite">{ready ? speech.text : ''}</p>
      <div className={`actions${ready && speech.actions.length ? ' show' : ''}`} ref={actionsRef}>
        {ready && speech.actions.map((a, i) => (
          <button key={`${speech.id}-${i}`} id={a.id} type="button" className={`act ${a.primary ? 'primary' : 'ghost'}`} onClick={a.onClick}>
            {a.label}{a.primary && <Arrow />}
          </button>
        ))}
      </div>
      {askEnabled && (
        <form className="ask" onSubmit={e => { e.preventDefault(); const v = q.trim(); if (!v) return; setQ(''); onAsk(v.slice(0, 300)); }}>
          <label className="sr-only" htmlFor="ask-in">Ask Pip a question</label>
          <input id="ask-in" ref={askRef} type="text" autoComplete="off" placeholder="Ask Pip anything…" maxLength={300} value={q} onChange={e => setQ(e.target.value)} />
          <button type="submit" aria-label="Send question"><Up /></button>
        </form>
      )}
    </div>
  );
}
