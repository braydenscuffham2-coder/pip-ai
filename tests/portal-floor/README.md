# Portal floor harness

Opens `public/portal.html` in headless Chrome as `https://www.hirepip.com/portal.html`, with a fake backend
built from TEST Fork's real rows (`fx_base.json`, test data only), so the 3D floor can be checked without signing in.

Setup once: `pip install playwright`, and put three@0.170.0 and @supabase/supabase-js@2.119.0 (from `npm pack`)
in `/tmp/vendor` (or set `PORTAL_VENDOR`). Their hashes match the page's integrity checks.

- `python3 shoot_stations.py owner 1280 800 /tmp/s` screenshots every station and the floor.
- `python3 shoot_flows.py founder 1280 800 /tmp/f mixed` walks the Floors menu, the founder office, a desk and the Let go card.
  Scenarios: `building`, `priced`, `setup`, `live`, `mixed`. Phone: use `390 844`.
