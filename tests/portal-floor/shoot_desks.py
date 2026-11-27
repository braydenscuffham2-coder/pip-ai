import sys; from h import run
# every teammate's desk, which picks its scene from how they are (working, needs you, unplugged, asleep), then the goodbye scene
role=sys.argv[1]; w=int(sys.argv[2]); hh=int(sys.argv[3]); pre=sys.argv[4]; scn=sys.argv[5] if len(sys.argv)>5 else 'mixed'
with run(scn, role, w, hh, mobile=w<720) as (page, calls):
    page.wait_for_timeout(7000); page.screenshot(path=f"{pre}-home.png")
    ids=page.evaluate("S.data.agents.map(a=>[a.spec_id, deskVariant(a)])"); print(ids)
    for i,(a,v) in enumerate(ids):
        page.evaluate(f"openMate('{a}')"); page.wait_for_timeout(2400); page.screenshot(path=f"{pre}-desk{i}-{v}.png")
    page.evaluate("(document.querySelector('[data-k=fl-letgo]')||(document.querySelector('[data-k=scr-more]').click(),null))"); page.wait_for_timeout(300); page.evaluate("document.querySelector('[data-k=fl-letgo]').click()"); page.wait_for_timeout(1500); page.screenshot(path=f"{pre}-letgo.png")
    n=len([c for c in calls if c[0]=='api']); page.evaluate("document.querySelector('[data-k=lg-go]').click()"); page.wait_for_timeout(500)
    print('calls after Let go:', len([c for c in calls if c[0]=='api'])-n)
    page.evaluate("document.querySelector('[data-k=lg-keep]').click()"); page.wait_for_timeout(1500); page.screenshot(path=f"{pre}-kept.png")
    page.evaluate("closeMate()"); page.wait_for_timeout(1500); page.screenshot(path=f"{pre}-back.png")
    for c in calls:
        if c[0]!="api" and 'GPU stall' not in str(c) and 'KHR_parallel' not in str(c): print(c)
