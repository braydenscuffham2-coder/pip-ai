import sys; from h import run
# phone + founder + desk view + let go + priced CTA
role=sys.argv[1]; w=int(sys.argv[2]); hh=int(sys.argv[3]); pre=sys.argv[4]; scn=sys.argv[5]
with run(scn, role, w, hh, mobile=w<720) as (page, calls):
    page.wait_for_timeout(8500); page.screenshot(path=f"{pre}-1home.png")
    print(page.evaluate("[S.bid, S.me.founder, !!document.querySelector('[data-k=fl-floors]')]"))
    if role=='founder':
        page.evaluate("document.querySelector('[data-k=fl-floors]').click()"); page.wait_for_timeout(1200); page.screenshot(path=f"{pre}-2floors.png")
        page.evaluate("S.menu=null;openStation('founder')"); page.wait_for_timeout(2600); page.screenshot(path=f"{pre}-3loft.png"); page.evaluate("closeDesk()"); page.wait_for_timeout(1500)
    a=page.evaluate("S.data.agents[0].spec_id"); page.evaluate(f"openMate('{a}')"); page.wait_for_timeout(2600); page.screenshot(path=f"{pre}-4desk.png")
    page.evaluate("document.querySelector('[data-k=fl-letgo]') && document.querySelector('[data-k=fl-letgo]').click()"); page.wait_for_timeout(800); page.screenshot(path=f"{pre}-5letgo.png")
    n=len([c for c in calls if c[0]=='api']); page.evaluate("document.querySelector('[data-k=lg-go]') && document.querySelector('[data-k=lg-go]').click()"); page.wait_for_timeout(600)
    print('calls after Let go:', len([c for c in calls if c[0]=='api'])-n, 'card still open:', page.evaluate("!!document.querySelector('.fl-letgo')"))
    page.evaluate("document.querySelector('[data-k=lg-keep]').click()"); page.wait_for_timeout(400)
    print('card closed by Keep:', page.evaluate("!document.querySelector('.fl-letgo')"))
    for c in calls:
        if c[0]!="api" and 'GPU stall' not in str(c) and 'KHR_parallel' not in str(c): print(c)
