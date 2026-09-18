# STATUS

Updated: 2026-09-19 · Iterations 1–5

## Works

**Opportunities** — `opportunities.html`
20 structured opportunities, 17 of them open, with filters, search, expiry handling and
URL-shareable state.
Every card carries an eligibility verdict for the visitor's country and career stage, with
a link to the source the verdict came from. No match percentages: none are calibrated yet.

**Eligibility engine** — `QIST.checkCountry()`
All 250 ISO countries, four Horizon Europe statuses (EU member / associated / funded /
self-funded). Verdicts are read from `data/eligibility.json`, never computed by a model.
A funder that publishes its own country list now overrides the programme table, carrying
its own source link: Faculty for the Future takes Uzbekistan, Kyrgyzstan, Tajikistan and
Turkmenistan but **not** Kazakhstan; the TWAS developing-countries list has no Georgia or
Armenia. Both were checked against the funders' own documents on 2026-09-18.

**Curator screen** — `curate.html`
Adding an opportunity no longer means editing JSON by hand. The screen validates against the
same rules the site uses — an external call cannot be saved without a link to the funder's
page, a country list cannot be saved without the source it came from, duplicate ids and
unknown country codes are caught before saving — then hands back the finished
`data/opportunities.json` to commit. It needs no backend. Linked from `admin.html`.

**Navigation** — Home · Opportunities · Researchers · For organizations · About QIST
Map and globe are views inside Researchers, not sections. Matching is not in public
navigation: it is personal and belongs behind sign-in. "For organizations" is the only
audience item on the site, and it is a deliberate exception (D-27).

**For organizations** — `organizations.html`
One page, two readings: a switch at the top rewrites the page for a university or a company
and tags every submission with `audience`, so the data decides later whether to split it.
Three things a visitor can actually do:

1. **Post a need** — an R&D problem, a vacancy, a consortium partner or a single expert
   question. It reaches a curator, who publishes it in Opportunities with the organisation
   named. Nothing appears on the site automatically.
2. **Find researchers** — a real search across all 497 directory records by field, country
   and free text, not a mock-up. "Request an introduction" opens inline and states, before
   anything is sent, that contact details are never passed on without that person's consent.
   No researcher's email is in the payload, because we do not hold one.
3. **Book 30 minutes** — a discovery call. The page says plainly there is nothing to buy.

A block at the bottom lists what does not exist yet — no organisation accounts, no verified
badges, no paid product — and its counters are computed from the data at load time, so they
cannot rot into a lie.

**Create profile** — `login.html`
The header button says "Create profile" and now does it: without a backend it collects a real
request through Formspree and a curator creates the profile by hand. It does not ask for a
password, because there is nowhere to keep one.

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
4. **17 active opportunities, not 100.** Still the product's real bottleneck, not the code.
   Ten calls were added on 2026-09-19, each read from the funder's own page: ERC Starting and
   Consolidator 2027, MSCA Doctoral Networks 2026, COST Open Call 2026, Erasmus+ Capacity
   Building, Faculty for the Future, Humboldt Research Fellowship, TWAS–FAPESP, NATO SPS and
   IIE-SRF. Several strong candidates were checked and **left out** because they had already
   closed (MSCA Postdoctoral Fellowships and COFUND, MSCA Staff Exchanges, Digital GreenTalents,
   TÜBİTAK 2216, L'Oréal-UNESCO For Women in Science) or because none of the nine countries
   qualify (TWAS-SISSA-Lincei is for least developed countries only). That filtering is the
   slow part of curation, and it is what the curator screen exists to keep honest.
5. **Backend is written but not deployed.** Opportunities are edited in a JSON file and reach
   the site by commit.
6. **Cities for 338 records are not recovered** — no geocoder reachable from the dev sandbox.
7. **10 directory records have no country and no organisation** and cannot be matched (B-19).

## Verified

137 automated checks in headless Chromium across `test.mjs` (21), `test2.mjs` (17),
`test3.mjs` (19), `test4.mjs` (16), `test5.mjs` (30) and `test6.mjs` (34). Covering: eligibility verdicts across two programmes and nine countries,
filters, empty and error states, expired entries, button behaviour with no endpoint
configured, absence of the admin password anywhere in the build, honest counters, coordinate
precision labels, the full 250-country selector, English-only interface text, and no
horizontal scroll at 390px. No JavaScript errors.

`test5.mjs` additionally runs every record in the data file through the site's own validator,
checks that the funder country lists produce the right verdict with the right source link, and
drives the curator screen end to end — empty form blocked, duplicate id caught, unknown country
code caught, country list without a source rejected, record saved, draft surviving a reload,
reset back to the committed file. It found three real defects on its first run: two records
carrying `country: "OTHER"` instead of an ISO code, and 529px of horizontal scroll on the new
screen at phone width. All three are fixed.

`test6.mjs` covers the organizations page against a local receiver, because formspree.io is
unreachable from the sandbox: it checks that all four submission kinds (`org_need`,
`org_introduction`, `org_conversation`, `profile_request`) actually leave the browser with the
right body and the `Accept: application/json` header Formspree needs, that a malformed email
sends nothing at all, and that no researcher contact detail is in any payload.

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

## Live check, 2026-09-18

Verified directly against `aika369.github.io/qist-platform/opportunities.html`:
build `2026-09-18d` served, 7 cards, 250 countries in two groups, 35 research fields,
no deploy-guard message. The site works. The earlier "page is newer than the files"
message came from a browser cache holding the previous `app.js`.

## Next

1. **Confirm the response path works.** Click **Interested** on the live site and check that the
   submission appears in the Formspree dashboard. That is the first real metric this product has
   ever produced, and nothing else on this list matters until it works.
2. **Curate weekly, not once.** Open `curate.html`, add what you find, download the file, commit.
   Twenty records is a demo; a hundred with live deadlines is a product. Three entries are already
   expired — B-21 is the habit of checking them, not a feature.
3. **Answer the new inbox.** The organizations page promises a reply within two working days.
   Decide who reads `org_need`, `org_introduction`, `org_conversation` and `profile_request`,
   and how fast (B-25). An unanswered promise is noticed on the first submission.
4. **Ten to fifteen conversations with universities** (B-26). That is what this page exists for,
   and what the paid product has to be built on.
5. **B-18 is still open.** The nine countries' Horizon Europe statuses have not been checked by a
   human against the EC PDF. One automated read of that document was already wrong about three of
   them.
