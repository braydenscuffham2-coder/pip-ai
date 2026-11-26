#!/usr/bin/env python3
"""Applies the current Brain (engine prompt + ranking rules) to every copy of the Pip page.

The Brain ships minified inside three files that must stay identical in behaviour:
  public/app.html              the page hirepip.com serves
  the published Claude artifact (saved to disk, patched, republished)
  claude-app/modules/brain.js  the readable copy

One source: scripts/brain/engine-prompt.txt holds the Imagination Engine prompt, and EDITS below holds
the code changes. Run:  python3 scripts/brain/patch_brain.py <file> [<file> ...]
It is safe to run twice: an edit that is already in place is skipped. It fails loudly if an anchor is
missing or ambiguous, so a copy can never be half patched without anyone noticing.
"""
import json
import pathlib
import sys

HERE = pathlib.Path(__file__).resolve().parent
PROMPT = (HERE / "engine-prompt.txt").read_text(encoding="utf-8")

# (name, old, new). Each old string must appear exactly once in an unpatched copy.
EDITS = [
    # Ranking no longer multiplies a penalty for every part that still has to be built. The hardest part
    # sets a mild discount, effort is a mild divisor, and the engine's own order counts.
    ("tier-weights",
     'Te={ready:1,needs_setup:.9,build:.7,hardware:.5}',
     'Te={ready:1,needs_setup:.97,build:.9,hardware:.75}'),
    ("score",
     'function U(e,t,s){let n=s.get(e.moment)?.severity??1,r=e.claims.map(d=>Ee[d.status]??0),c=r.reduce((d,g)=>d+g,0)*n,f=r.length?r.reduce((d,g)=>d+g,0)/r.length:0,y=(t.repaired_uses??e.uses).map(d=>v(d)).filter(Boolean).reduce((d,g)=>d*Te[g.tier],1),u=Math.max(1,t.effort),m=t.status==="drop"?0:1,p=m*(c*f*y)/u;return{impact:c,confidence:f,feasibility:y,effort:u,risk_gate:m,score:Number(p.toFixed(4))}}',
     'function U(e,t,s,__i){let n=s.get(e.moment)?.severity??1,r=e.claims.map(d=>Ee[d.status]??0),c=r.reduce((d,g)=>d+g,0)*n,f=r.length?r.reduce((d,g)=>d+g,0)/r.length:0,y=(t.repaired_uses??e.uses).map(d=>v(d)).filter(Boolean).reduce((d,g)=>Math.min(d,Te[g.tier]??1),1),u=1+.1*(Math.max(1,t.effort)-1),__r=typeof __i=="number"?1+.4*Math.max(0,1-__i/8):1,m=t.status==="drop"?0:1,p=m*(c*f*y*__r)/u;return{impact:c,confidence:f,feasibility:y,effort:u,rank:__r,risk_gate:m,score:Number(p.toFixed(4))}}'),
    ("score-call",
     'e.scored=r.map(p=>{let d=h[p.id];return{candidate:p,gate:d,score:U(p,d,m)}})',
     'e.scored=r.map((p,__i)=>{let d=h[p.id];return{candidate:p,gate:d,score:U(p,d,m,e.engine?.ok?__i:void 0)}})'),
    # House picks (competitor watching, review asking or replying) are offered to every business:
    # at most one of each on a team, and each has to earn its place against a discount. The discount is
    # light when the engine itself ranked the idea in its first six, heavy when it did not.
    ("house-def",
     'function W(e,t){let s=t.keep??6',
     'var __house=l=>{let u=l.gate.repaired_uses??l.candidate.uses??[];return u.includes("rival_watch")||u.includes("web_monitor")&&/competitor|rival/i.test(`${l.candidate.name||""} ${l.candidate.concept||""}`)?"rival":l.candidate.power==="reviews"?"reviews":null};function W(e,t){let s=t.keep??6'),
    ("house-use",
     'for(let w of b){if((g.get(w.candidate.power)??0)>=o)continue;let _=p(w);',
     'for(let w of b){if((g.get(w.candidate.power)??0)>=o)continue;let __h=__house(w);if(__h&&d.some(A=>__house(A)===__h))continue;let _=p(w)*(__h?w.score.rank>1.12?.8:.45:1);'),
    # The big-swing slot can also go to an idea that needs a part Pip has not built yet.
    ("wild",
     'let k=b.filter(l=>l.gate.lane!=="spec");',
     'let k=b.filter(l=>l.gate.lane!=="spec"||l.candidate.new_capability);'),
    # If the engine restarts and writes its answer twice, use the last complete answer instead of failing.
    ("last-answer-def",
     'async function __engine(e,t,s,o){',
     'function __last(e){let s=String(e||""),o=null,d=0,a=-1,q=!1,x=!1;for(let i=0;i<s.length;i++){let h=s[i];if(d>0&&q){x?x=!1:h==="\\\\"?x=!0:h===\'"\'&&(q=!1);continue}if(d>0&&h===\'"\'){q=!0;continue}if(h==="{"){d===0&&(a=i);d++}else if(h==="}"&&d>0&&--d===0&&a>=0){try{let j=JSON.parse(s.slice(a,i+1));j&&Array.isArray(j.ideas)&&j.ideas.length&&(o=j)}catch{}a=-1}}return o}async function __engine(e,t,s,o){'),
    ("last-answer-use",
     'c=N(r),f=!1;if(!c){f=!0;c=N(await t(`The text between the <reply> tags',
     'c=N(r)||__last(r),f=!1;if(!c){f=!0;c=N(await t(`The text between the <reply> tags'),
    # The engine may name a part that is not on the list. Keep it, cleaned, on the idea.
    ("idea-field",
     'lens:typeof u.lens=="string"&&u.lens?u.lens:"engine"})}',
     'lens:typeof u.lens=="string"&&u.lens?u.lens:"engine",new_capability:typeof u.new_capability=="string"?u.new_capability.replace(/\\s+/g," ").replace(/\u2014/g,", ").trim().slice(0,160):""})}'),
    ("never-gate",
     '${[o.name,...o.claims.map(n=>n.text),o.why_personal].filter(Boolean)',
     '${[o.name,...o.claims.map(n=>n.text),o.why_personal,o.new_capability].filter(Boolean)'),
    # The write-up must say plainly when a part still has to be built. No dates, no prices.
    ("render-honest",
     'The owner will need: ${o.needs.join("; ")||"nothing special"}.',
     'The owner will need: ${o.needs.join("; ")||"nothing special"}.${s.new_capability?`\\nOne part of this does not exist yet, and Pip\'s Forge would build it for this business: ${s.new_capability}. Design the skill around it anyway. Never describe that part as already running. In "setup", make the first step that Pip builds this part before go-live. Answer one "faq" question about it honestly, with no dates and no prices.`:""}'),
    ("render-fields",
     'risk:d.gate.risk,needs:d.gate.needs,moment:d.candidate.moment,wild:d===r.wild}',
     'risk:d.gate.risk,needs:d.candidate.new_capability?[...d.gate.needs,`Pip builds: ${d.candidate.new_capability}`]:d.gate.needs,pip_builds:d.candidate.new_capability||void 0,moment:d.candidate.moment,wild:d===r.wild}'),
    # Page only (not in the readable Brain copy). A pick that needs a part Pip has not built yet must not
    # promise a date. Everywhere the page would say "Ready in 2-3 weeks" it says "Built for you" instead.
    ("page:honest-badge",
     'match:Math.round(rm(n.match,50,98)??75),effort:i.effort,custom:a||void 0,',
     'match:Math.round(rm(n.match,50,98)??75),effort:n.pip_builds?"Built for you":i.effort,builds:V(n.pip_builds,160)||void 0,custom:a||void 0,'),
    # The Market street asked the browser for an image at "/[object Object]": a shop's logo is an object
    # ({w, h, data, ...}), not an address. Only a plain address is loaded now, so the stray request is gone and the
    # street looks exactly as it did (the logo never drew before either).
    ("page:no-object-image",
     'const src=me?K6.logo:kit?.logo;if(src){let im=new Image();',
     'const src0=me?K6.logo:kit?.logo,src=typeof src0=="string"?src0:null;if(src){let im=new Image();'),
    # The order tells the Forge which part Pip has to build for a teammate. Before this the page showed "Pip builds: ..."
    # to the owner and then left it out of the order, so the Forge built the ordinary version without knowing.
    ("page:order-builds",
     'why_personal:c(J.why_personal||J.why,300)||void 0,moment:J.moment&&',
     'why_personal:c(J.why_personal||J.why,300)||void 0,builds:c(J.builds||J.pip_builds,300)||void 0,moment:J.moment&&'),
    # A handle for the tests in tests/site/brain-inpage.test.mjs.
    ("test-handle",
     'globalThis.__pipBrain={design:qe,PRIMITIVES:x,version:3,',
     'globalThis.__pipBrain={design:qe,PRIMITIVES:x,version:3,engine:4,_t:{score:U,select:W,gate:M,fill:__fill,last:__last},'),
]


def js_string(s: str) -> str:
    out = json.dumps(s, ensure_ascii=False)
    return out.replace("</", "<\\/").replace("\u2028", "\\u2028").replace("\u2029", "\\u2029")


def find_prompt(text: str):
    start = text.find('var __EP="')
    if start < 0 or text.count('var __EP="') != 1:
        raise SystemExit("engine prompt: expected exactly one `var __EP=`")
    k = start + len('var __EP="')
    while True:
        k = text.find('"', k)
        if k < 0:
            raise SystemExit("engine prompt: unterminated string")
        back, m = 0, k - 1
        while text[m] == "\\":
            back += 1
            m -= 1
        if back % 2 == 0:
            break
        k += 1
    a, b = start + len("var __EP="), k + 1
    return a, b, json.loads(text[a:b])


def patch(text: str, strict: bool = True):
    report = []
    a, b, current = find_prompt(text)
    if current == PROMPT:
        report.append("prompt: already current")
    else:
        text = text[:a] + js_string(PROMPT) + text[b:]
        report.append(f"prompt: replaced ({len(current)} -> {len(PROMPT)} chars)")
    is_page = text.lstrip()[:15].lower().startswith('<!doctype html')
    for name, old, new in EDITS:
        want = 1
        if "*" in name:
            name, times = name.split("*")
            want = int(times)
        if name.startswith("page:") and not is_page:
            continue
        if new in text:
            report.append(f"{name}: already in place")
            continue
        n = text.count(old)
        if n != want:
            msg = f"{name}: anchor found {n} times"
            if strict:
                raise SystemExit(msg)
            report.append(msg + " (skipped)")
            continue
        text = text.replace(old, new)
        report.append(f"{name}: applied")
    return text, report


if __name__ == "__main__":
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    loose = "--loose" in sys.argv
    if not args:
        raise SystemExit(__doc__)
    for path in args:
        p = pathlib.Path(path)
        before = p.read_text(encoding="utf-8")
        after, report = patch(before, strict=not loose)
        if after != before:
            p.write_text(after, encoding="utf-8")
        print(f"{path}: {'changed' if after != before else 'no change'}")
        for line in report:
            print("  -", line)
