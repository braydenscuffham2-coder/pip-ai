# Brain baselines, Nov 22, 2026

Two baselines on the same 10 Boise businesses, scored before any Part 1 change. Use these files to re-score after the fixes.

| | In-page Brain (what hirepip.com runs) | scan-run v15 |
| --- | --- | --- |
| Picks | 67 | 62 |
| Average total (of 20) | 13.7 | 12.0 |
| Picks that clear the bar | 36 (54%) | 11 (18%) |
| Duplicates | 0 | 9 |
| Blocked on something Pip does not own (Build 2 or less) | 30 (45%) | 29 (47%) |
| Model cost per scan | $1.40 | $1.07 |

## Rubric

Each pick is scored 1 to 5 on four things, by one reviewer, not blind.

- **Spec:** could it only fit this business.
- **Evid:** is it tied to something real on their site, reviews or competitors.
- **Build:** can the Forge build it with what Pip owns. 5 = buildable now with no owner tool. 4 = needs only a sign-in that exists today. 3 = buildable but needs a registration or an unproven part. 2 = depends on a provider or system Pip does not own or could not name. 1 = blocked.
- **Value:** would an owner pay for it.

A pick clears the bar when Spec is 4 or more, Evid is 4 or more, Value is 3 or more, and it is not flagged Generic or Duplicate.

## Files

- `scan-run-scores.psv`: the 62 picks from scan-run, the server Brain. The raw results are the 10 `scan_jobs` rows created on 2026-11-23 UTC and their 191 `scan_ideas` rows.
- `in-page-scores.psv`: the 67 picks from the live page. Captured with `scripts/brain-baseline/inpage_scan.py`, which opens hirepip.com in headless Chrome, types the domain, and records the page's own `/api/sample` calls. The raw captures are not in git because they contain Google review text.

## Cautions

- Bittercreek Alehouse was scanned twice on the page and only 2 of 7 picks came back the same. A one-point move in an average is inside the noise. Scan each business twice when re-scoring.
- The in-page run read 165 to 248 reviews for four businesses and 5 for the other six.

## Businesses

bittercreekalehouse.com, trilliumboise.com, idahostreetdental.com, smilesonstatestreet.com, cloverdaleplumbing.com, garytheplumber208.com, graeberandcompany.com, madrilsalon.com, templetonrealestategroup.com, sheilasmithrealestate.com. None was contacted and no order was placed.
