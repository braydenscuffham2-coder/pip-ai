import sys; from h import run
role=sys.argv[1]; w=int(sys.argv[2]); hh=int(sys.argv[3]); pre=sys.argv[4]; scn=sys.argv[5] if len(sys.argv)>5 else 'live'
with run(scn, role, w, hh, mobile=w<720) as (page, calls):
    page.wait_for_timeout(8000)
    for st in ['front','meter','tools','comms','exit'] + (['founder'] if role=='founder' else []):
        page.evaluate("s=>openStation(s)", st); page.wait_for_timeout(2200); page.screenshot(path=f"{pre}-{st}.png")
    page.evaluate("closeDesk()"); page.wait_for_timeout(1800); page.screenshot(path=f"{pre}-home.png")
    for c in calls:
        if c[0]!="api" and 'GPU stall' not in str(c) and 'KHR_parallel' not in str(c): print(c)
