import sys; from h import run
# the painted hall: arrival, floor, a desk, the tool wall
role=sys.argv[1]; w=int(sys.argv[2]); hh=int(sys.argv[3]); pre=sys.argv[4]; scn=sys.argv[5] if len(sys.argv)>5 else 'mixed'
with run(scn, role, w, hh, mobile=w<720) as (page, calls):
    page.wait_for_timeout(9000); page.screenshot(path=f"{pre}-home.png")
    ids=page.evaluate("S.data.agents.map(a=>a.spec_id)")
    page.evaluate(f"openMate('{ids[0]}')"); page.wait_for_timeout(3000); page.screenshot(path=f"{pre}-desk.png")
    page.evaluate("closeMate()"); page.wait_for_timeout(2500)
    page.evaluate("openStation('tools')"); page.wait_for_timeout(3000); page.screenshot(path=f"{pre}-tools.png")
    for c in calls:
        if c[0]!="api" and 'GPU stall' not in str(c) and 'KHR_parallel' not in str(c): print(c)
