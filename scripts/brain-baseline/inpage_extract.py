import json,sys,re
def jparse(s):
    if not s: return None
    i=s.find('{'); j=s.rfind('}')
    try: return json.loads(s[i:j+1])
    except Exception: return None
def idea_from_input(inp):
    k=inp.find('THE IDEA'); 
    if k<0: return None
    s=inp[k+8:]; i=s.find('{'); dec=json.JSONDecoder()
    try: return dec.raw_decode(s[i:])[0]
    except Exception: return None
for d in sys.argv[1:]:
    D=json.load(open(f'./inpage/{d}.json')); calls=D['calls']
    eng=[c for c in calls if 'Imagination Engine' in str(c['input'])[:300]]
    rend=[c for c in calls if 'Develop ONE AI skill' in str(c['input'])[:300]]
    rep=[c for c in calls if 'failed a feasibility check' in str(c['input'])[:400] or 'This idea for' in str(c['input'])[:200]]
    revs=[int(m) for c in calls for m in re.findall(r'Below are (\d+) Google reviews of',str(c['input'])[:200])]
    eo=jparse(eng[0]['out']) if eng else None
    ideas=(eo or {}).get('ideas') or []
    print(f"\n=== {d} | secs {D['secs']} | sample calls {len(calls)} | non-200 {[c['status'] for c in calls if c['status']!=200][:5]} | engine ideas {len(ideas)} | engine keys {list((eo or {}).keys())[:8]} | repairs {len(rep)} | renders {len(rend)}")
    m=re.search(r'READ[^|]{0,80}REVIEWS[^|]{0,40}',D.get('visible') or ''); print('   page says:',m.group(0) if m else None)
    seen={}
    for c in rend:
        idea=idea_from_input(c['input']) or {}; out=jparse(c.get('out')) or {}
        n=out.get('name') or idea.get('name')
        if n in seen and not out.get('tagline'): continue
        ev=[ (e.get('quote') or e.get('text') or '')[:80] for cl in (idea.get('claims') or []) for e in (cl.get('evidence') or [])][:2]
        mo=idea.get('moment'); mo=mo if isinstance(mo,str) else (mo or {}).get('id')
        seen[n]=f" - {n} | {idea.get('power')} | {','.join(idea.get('uses') or [])} | {out.get('tagline')} | WHY {(out.get('why') or idea.get('why_personal') or '')[:150]}"
    for v in seen.values(): print(v)
    print('   distinct picks',len(seen))
