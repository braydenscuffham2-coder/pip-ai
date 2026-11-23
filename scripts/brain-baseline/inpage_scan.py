import os, sys, json, time
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright
domain=sys.argv[1]; cap=int(sys.argv[2]) if len(sys.argv)>2 else 420
u=urlparse(os.environ['HTTPS_PROXY']); proxy={'server':f'{u.scheme}://{u.hostname}:{u.port}'}
if u.username: proxy['username']=u.username; proxy['password']=u.password or ''
calls=[]; other=[]
def text_of(body):
    out=[]
    for line in (body or '').split('\n'):
        line=line.strip()
        if not line: continue
        try:
            j=json.loads(line)
            if j.get('t')=='d': out.append(j.get('d',''))
            elif j.get('t') in('end','err'): out.append('')
        except Exception: pass
    return ''.join(out)
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/google-chrome',headless=True,proxy=proxy,args=['--no-sandbox','--enable-unsafe-swiftshader','--mute-audio'])
    ctx=b.new_context(viewport={'width':1280,'height':800}); pg=ctx.new_page(); t0=time.time()
    def on_resp(r):
        url=r.url
        if '/api/sample' in url:
            try: req=json.loads(r.request.post_data or '{}')
            except Exception: req={}
            rec={'t':round(time.time()-t0,1),'status':r.status,'tier':req.get('modelTier') or req.get('model'),'input':req.get('input'),'out':None}
            calls.append(rec)
            try: rec['out']=text_of(r.text()); rec['done']=round(time.time()-t0,1)
            except Exception as e: rec['err']=str(e)[:100]
        elif any(k in url for k in ('site-kit','rival-read','/api/gather','pip-pass','/api/scan','/api/order')) :
            other.append((round(time.time()-t0,1),r.status,url.split('?')[0][-40:]))
    pg.on('response',on_resp)
    pg.goto('https://www.hirepip.com/',wait_until='load'); pg.wait_for_timeout(3500)
    inp=pg.locator('input').first; inp.click(); inp.fill(domain); pg.keyboard.press('Enter')
    last=0; shots=0
    while time.time()-t0<cap:
        pg.wait_for_timeout(5000)
        eng=[c for c in calls if 'Imagination Engine' in str(c.get('input'))[:400]]
        open_=[c for c in calls if c.get('out') is None and not c.get('err')]
        lastdone=max([c.get('done',0) for c in calls] or [0]); laststart=max([c['t'] for c in calls] or [0])
        if eng and all(c.get('out') is not None or c.get('err') for c in eng) and not open_ and time.time()-t0-max(lastdone,laststart)>50: break
        if len(calls)!=last: last=len(calls)
    try:
        pg.screenshot(path=f'./inpage/{domain}.png'); vis=pg.evaluate("()=>document.body.innerText.slice(0,600)")
    except Exception as e: vis=str(e)
    b.close()
json.dump({'domain':domain,'calls':calls,'other':other,'visible':vis,'secs':round(time.time()-t0)},open(f'./inpage/{domain}.json','w'))
print(domain,'secs',round(time.time()-t0),'sample calls',len(calls),'statuses',sorted(set(c['status'] for c in calls)),'other',len(other))
for c in calls: print(' ',c['t'],c.get('done'),c['status'],c['tier'],len(str(c.get('input'))),len(c.get('out') or ''),'|',str(c.get('input'))[:70].replace('\n',' '))
print('VISIBLE:',vis[:300].replace('\n',' | '))
