# Pip in the Claude app

This is the current Pip: the version that runs as an artifact inside the Claude app. It's the same build that runs live there, with two changes for publishing, listed below.

<img src="../docs/images/claude-app-home.webp" alt="Pip's home screen in the Claude app: a 3D glass character with an antenna next to the headline 'Meet the upside of being understood.' and a website field reading yourbusiness.com." width="100%">

## What it does

An owner types their website. Pip opens with the Recall, a scan show on a 3D stage where it reads the site, the Google listing and nearby rivals. Then it walks them through six steps:

1. **You:** what Pip found about the business, and where it shows up on Google Maps.
2. **Your market:** how it compares with nearby competitors.
3. **Try it:** a live AI teammate the owner can test.
4. **What I found:** the gaps worth fixing.
5. **Your team:** the AI teammates picked for this business.
6. **Lock it in:** the owner sends the plan.

## How it runs

The page uses three things the Claude app provides, and no API keys.

| Capability | Used for |
|---|---|
| `sample` | Every model call. It runs on the viewer's own Claude plan, so using Pip doesn't touch API credits. |
| `mcp` | Website reads, through the PIP Reader connector ([`supabase/functions/pip-reader`](../supabase/functions/pip-reader)). If the connector isn't allowed, it falls back to the desktop app's browser. |
| `db` | Saving each business's brief and setup between visits. |

The reads go to the same backend as the website: `/api/gather` on the Next.js app, plus the `site-kit` and `rival-read` edge functions.

## Files

| Path | What it is |
|---|---|
| `pip.html` | The whole app as one self-contained file: the React UI, the Recall's 3D engine (three.js), the Brain and the styles. It's a bundled build, so most of it is minified. |
| `modules/brain.js` | The Brain: a 63-part library of AI building blocks, with the gates and scoring that decide what each business gets. |
| `modules/pip-market.js` | The Market cards: Google Maps presence, local search demand, and phone page speed. |
| `modules/pip-reader.js` | Sends website reads through the PIP Reader connector, with the browser fallback. |
| `modules/pip-legal.js` | The Terms of Service and Privacy Policy reader. |

The `modules/` files are copied out of `pip.html` so they're easier to read. The build is the source of truth.

## Differences from the live artifact

- **No built-in examples.** The live version includes two example businesses (a plumber and a dentist) built from real local scans. Their stored data and the "Example" buttons are removed. Scanning any real website works the same.
- **Sample stories use made-up names.** The teammate catalog's sample stories now name fictional businesses.
- **The Supabase project address is a placeholder.** It reads `YOUR-PROJECT-REF` instead of the real address. To run your own copy, set it to your project and deploy the functions in [`supabase/`](../supabase).
