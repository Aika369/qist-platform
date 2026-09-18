# STATUS

Updated: 2026-09-18 · Iterations 1–3

## Works

**Opportunities** — `opportunities.html`
10 structured opportunities with filters, search, expiry handling and URL-shareable state.
Every card carries an eligibility verdict for the visitor's country and career stage, with
a link to the source the verdict came from. No match percentages: none are calibrated yet.

**Eligibility engine** — `QIST.checkCountry()`
All 250 ISO countries, four Horizon Europe statuses (EU member / associated / funded /
self-funded). Verdicts are read from `data/eligibility.json`, never computed by a model.

**Navigation** — Home · Opportunities · Researchers · About QIST
Map and globe are views inside Researchers, not sections. Matching is not in public
navigation: it is personal and belongs behind sign-in.

**Honesty fixes**
- Hard-coded admin credentials removed from the public JS *and* from the sign-in page text.
- Sign-in, registration and the admin console disable themselves without a backend,
  instead of writing fake accounts into the visitor's own browser.
- Home page counters: `497 / 42 / 902 / 13` → `492 / 41 / 32 / 7`.
- `geo_precision` on every directory record: 338 hold a country centroid, and that is now
  visible on the map, in the directory and on the globe rather than shown as a real address.
- 5 probable duplicate records flagged, not deleted.

**Language** — the whole interface and all opportunity data are in English.
Researchers' own names are left exactly as recorded.

## Limits — know these before launch

1. **`INTEREST_ENDPOINT`, `SIGNUP_ENDPOINT`, `CONTACT_EMAIL` are empty.** Until they are set,
   no response and no email address is collected at all. Formspree setup: README.
   Tally does not work for this — see D-17.
2. **`CONTACT_EMAIL` is the most urgent of the three**: 492 people are published with no
   working way to ask for removal.
3. **Eligibility lists were extracted by automated reading of the EC PDF.** One earlier read
   of the same document was wrong about three countries. Have a human spot-check the nine
   priority countries and record it in `eligibility.json` → `verification.reviewed_by` (B-18).
4. **7 active opportunities.** This is the product's real bottleneck, not the code.
5. **Backend is written but not deployed.** Opportunities are edited in a JSON file and reach
   the site by commit.
6. **Cities for 338 records are not recovered** — no geocoder reachable from the dev sandbox.
7. **10 directory records have no country and no organisation** and cannot be matched (B-19).

## Verified

56 automated checks in headless Chromium across `test.mjs` (21), `test2.mjs` (16),
`test3.mjs` (19). Covering: eligibility verdicts across two programmes and nine countries,
filters, empty and error states, expired entries, button behaviour with no endpoint
configured, absence of the admin password anywhere in the build, honest counters, coordinate
precision labels, the full 250-country selector, English-only interface text, and no
horizontal scroll at 390px. No JavaScript errors.

`L is not defined` on map.html appears only in the sandbox, where unpkg.com is blocked.
Leaflet loads on the live site — checked 2026-09-14. **The country-marker logic on the map
is therefore not covered by automated tests; please look at it after deploying.**

## Deploy — read this first

A release is **one set of files that must go up together**. The 2026-09-18 incident: the three
HTML files reached the server but `assets/js/app.js`, `data/eligibility.json` and
`data/opportunities.json` did not. The page called a helper that was not there, threw, and
rendered blank with no explanation.

Two things changed because of it:

- `opportunities.html` now checks its dependencies and, if they are stale, says which file is
  out of date instead of showing an empty page.
- When you upload a release, upload **every file in the zip**, including the `assets/` and
  `data/` folders. Dragging only the changed HTML is what caused this.

## Next

Endpoints are configured (`formspree.io/f/xyezzgdo`, `info@qista.org`). After this release is
fully uploaded: click **Interested** on the live site and confirm the submission appears in the
Formspree dashboard. That is the first real metric this product has ever produced.
