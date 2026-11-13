'use client';
import { useEffect, useRef } from 'react';
import type { OutfitId } from '@/lib/outfit';

export type Mood = 'idle' | 'talk' | 'happy' | 'think' | 'wow' | 'present' | 'scan';

export function Pip({ mood, hopKey, onPoke, outfit = 'none' }: { mood: Mood; hopKey: number; onPoke?: () => void; outfit?: OutfitId }) {
  const ref = useRef<HTMLDivElement>(null);
  const eyes = useRef<SVGGElement>(null);

  useEffect(() => {
    const move = (e: PointerEvent) => {
      const el = ref.current, g = eyes.current;
      if (!el || !g) return;
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height * 0.55);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 260);
      g.style.transform = `translate(${((dx / d) * 3.4 * k).toFixed(2)}px, ${((dy / d) * 3.4 * k).toFixed(2)}px)`;
    };
    window.addEventListener('pointermove', move, { passive: true });
    return () => window.removeEventListener('pointermove', move);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el || hopKey === 0 || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('hop');
    void el.offsetWidth;
    el.classList.add('hop');
  }, [hopKey]);

  const first = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (first.current) { first.current = false; return; }
    if (!el || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.remove('poof'); void el.offsetWidth; el.classList.add('poof');
  }, [outfit]);

  return (
    <div className="pet" ref={ref} data-mood={mood} data-outfit={outfit} role="img" aria-label="Pip, a small glass guide" onClick={onPoke}>
      <svg viewBox="0 0 120 130" aria-hidden="true">
        <defs>
          <radialGradient id="pb" cx="36%" cy="30%" r="78%">
            <stop offset="0" className="pb0" /><stop offset=".42" className="pb1" /><stop offset=".8" className="pb2" /><stop offset="1" className="pb3" />
          </radialGradient>
        </defs>
        <ellipse className="p-shadow" cx="60" cy="123" rx="26" ry="5" />
        <g className="p-float"><g className="p-hop">
          <g><path className="p-ant-line" d="M60 28C60 20 64 15 69 11" /><circle className="p-bulb" cx="70" cy="10" r="5" /></g>
          <ellipse className="p-arm l" cx="21" cy="74" rx="7" ry="11" />
          <ellipse className="p-arm r" cx="99" cy="74" rx="7" ry="11" />
          <path className="p-body" d="M60 26C87 26 101 46 101 70C101 93 83 108 60 108C37 108 19 93 19 70C19 46 33 26 60 26Z" />
          <ellipse className="p-shine" cx="43" cy="43" rx="12" ry="6.5" transform="rotate(-28 43 43)" />
          <circle className="p-spark" cx="33" cy="56" r="2.4" />
          <Body outfit={outfit} />
          <g className="p-eyes" ref={eyes}>
            <g className="p-eye"><ellipse cx="47" cy="68" rx="6.5" ry="8.5" /><circle className="p-glint" cx="49.2" cy="64.6" r="2.2" /></g>
            <g className="p-eye"><ellipse cx="73" cy="68" rx="6.5" ry="8.5" /><circle className="p-glint" cx="75.2" cy="64.6" r="2.2" /></g>
            <path className="p-happy" d="M40.5 70Q47 61.5 53.5 70M66.5 70Q73 61.5 79.5 70" />
          </g>
          <ellipse className="p-cheek" cx="35.5" cy="81" rx="6" ry="3.4" /><ellipse className="p-cheek" cx="84.5" cy="81" rx="6" ry="3.4" />
          <path className="p-mouth smile" d="M54.5 82Q60 87.5 65.5 82" />
          <ellipse className="p-mouth open" cx="60" cy="84" rx="4.2" ry="3.4" />
          <Head outfit={outfit} />
          <g className="p-clicker">
            <rect x="99" y="54" width="7" height="14" rx="2.5" />
            <circle className="p-led" cx="102.5" cy="57.5" r="1.6" />
            <path className="p-beam" d="M104 55L128 44" />
          </g>
        </g></g>
      </svg>
      <span className="p-rings" aria-hidden="true"><i /><i /></span>
      <span className="p-poof" aria-hidden="true"><i /><i /><i /><i /><i /><i /></span>
      <span className="p-think" aria-hidden="true"><i /><i /><i /></span>
    </div>
  );
}

/** Clothing drawn on the body, under the face. */
function Body({ outfit }: { outfit: OutfitId }) {
  switch (outfit) {
    case 'shop': return (
      <g className="o o-apron">
        <path className="o-apron-cloth" d="M40 94Q60 91 80 94L78 107Q60 112 42 107Z" />
        <path className="o-apron-strap" d="M40 94Q34 86 30 78M80 94Q86 86 90 78" />
        <rect className="o-tag" x="64" y="97" width="11" height="6" rx="1.5" />
      </g>);
    case 'medical': return (
      <g className="o o-scrubs">
        <path className="o-scrub-cloth" d="M26 88Q60 100 94 88Q92 102 60 108Q28 102 26 88Z" />
        <path className="o-steth" d="M44 92Q46 103 56 103M76 92Q74 103 64 103M56 103Q60 106 64 103" />
        <circle className="o-steth-end" cx="60" cy="105" r="2.6" />
      </g>);
    case 'coach': return (
      <g className="o o-whistle">
        <path className="o-cord" d="M42 92Q60 104 78 92" />
        <rect className="o-whistle-body" x="55" y="98" width="10" height="6" rx="3" />
      </g>);
    case 'realtor': return (
      <g className="o o-tie">
        <path className="o-bow" d="M60 97L50 92V102ZM60 97L70 92V102Z" />
        <circle className="o-knot" cx="60" cy="97" r="2.6" />
      </g>);
    default: return null;
  }
}

/** Hats, masks and held tools, drawn over the face. */
function Head({ outfit }: { outfit: OutfitId }) {
  switch (outfit) {
    case 'hardhat': return (
      <g className="o o-hardhat">
        <path className="o-hat" d="M28 42Q28 14 60 13Q92 14 92 42Z" />
        <path className="o-hat-ridge" d="M60 13V40M47 16Q45 28 46 40M73 16Q75 28 74 40" />
        <rect className="o-brim" x="22" y="39" width="76" height="7" rx="3.5" />
        <path className="o-shine" d="M36 30Q38 21 46 18" />
      </g>);
    case 'medical': return (
      <g className="o o-medical">
        <path className="o-cap" d="M30 40Q31 18 60 17Q89 18 90 40Q60 33 30 40Z" />
        <circle className="o-mirror" cx="60" cy="30" r="5" /><circle className="o-mirror-in" cx="60" cy="30" r="2.4" />
        <path className="o-strap" d="M37 81L22 74M83 81L98 74M37 89L24 92M83 89L96 92" />
        <path className="o-mask" d="M37 78Q60 72 83 78L82 90Q60 99 38 90Z" />
        <path className="o-mask-fold" d="M41 83Q60 79 79 83M42 87Q60 84 78 87" />
      </g>);
    case 'mechanic': return (
      <g className="o o-mechanic">
        <path className="o-cap-dome" d="M30 42Q30 17 60 16Q90 17 90 42Z" />
        <path className="o-cap-bill" d="M30 40Q12 40 8 47Q24 49 40 44Z" />
        <circle className="o-button" cx="60" cy="17" r="2.6" />
        <g className="o-held" transform="rotate(-24 22 78)">
          <rect x="19" y="58" width="5" height="22" rx="2" />
          <path d="M15 56A6 6 0 1 1 28 56L24 58H19Z" />
        </g>
      </g>);
    case 'stylist': return (
      <g className="o o-stylist">
        <path className="o-beret" d="M30 36Q32 16 64 17Q94 19 92 34Q62 42 30 36Z" />
        <path className="o-beret-nub" d="M62 17Q63 11 67 11" />
        <g className="o-held">
          <circle cx="13" cy="80" r="4" /><circle cx="21" cy="84" r="4" />
          <path d="M15 77L30 60M19 81L32 63" />
        </g>
      </g>);
    case 'chef': return (
      <g className="o o-chef">
        <path className="o-toque" d="M36 40V30Q24 26 28 15Q33 6 44 10Q50 0 62 4Q72 -1 79 8Q92 7 92 19Q93 28 84 30V40Z" />
        <rect className="o-band" x="35" y="33" width="50" height="9" rx="2" />
        <path className="o-toque-fold" d="M50 14V30M64 9V30M76 13V30" />
      </g>);
    case 'realtor': return (
      <g className="o o-realtor">
        <g className="o-held">
          <rect x="4" y="60" width="2.6" height="34" rx="1" />
          <rect className="o-sign" x="-4" y="54" width="22" height="13" rx="2" />
          <text x="7" y="63.6" textAnchor="middle">SOLD</text>
        </g>
      </g>);
    case 'coach': return (
      <g className="o o-coach">
        <path className="o-band" d="M23 50Q60 36 97 50L98 58Q60 44 22 58Z" />
        <path className="o-band-stripe" d="M23 54Q60 40 97 54" />
      </g>);
    case 'shop': return (
      <g className="o o-shop">
        <path className="o-visor" d="M31 40Q60 30 89 40L91 46Q60 37 29 46Z" />
      </g>);
    default: return null;
  }
}
