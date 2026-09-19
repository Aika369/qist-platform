# How to upload this release

The last three attempts put the HTML files on the server but left `assets/` and `data/`
behind, which is why the site broke. This folder is **the complete repository** — every file,
not just the changed ones. Replace the repo contents with it and the mismatch cannot happen.

## Option A — GitHub in the browser (no tools)

1. Unzip this archive. You get a folder with 35 files, including `assets/` and `data/`.
2. Open `https://github.com/Aika369/qist-platform`
3. **Add file → Upload files**
4. Open the unzipped folder on your computer, **select everything inside it**
   (`Ctrl+A` on Windows, `Cmd+A` on Mac — including the `assets`, `data`, `backend`
   and `.github` folders) and drag it all into the browser window at once.
5. Wait until GitHub lists every file, then **Commit changes** at the bottom.

Do not upload files one by one. Dragging a folder keeps the paths; picking single files
does not, and that is exactly what went wrong before.

## Option B — GitHub Desktop (more reliable, 5 minutes to set up)

1. Install GitHub Desktop, sign in, **Clone repository** → `Aika369/qist-platform`.
2. Copy the contents of this folder over the cloned folder, replacing everything.
3. GitHub Desktop shows the list of changed files — check that `assets/js/app.js`
   and both files in `data/` are in the list.
4. Write a commit message, **Commit to main**, then **Push origin**.

## How to confirm it actually worked

Wait about a minute after committing, then open the live site and press `F12` → **Console**.
The first line should read:

```
QIST build 2026-09-20a
```

If it says anything else, or nothing, the JavaScript file did not reach the server.

Then open **Opportunities**. You should see:

- **17 cards** (20 entries, three with a passed deadline hidden by default),
- **My country** with 250 countries, the nine priority ones at the top,
- **All research fields** with all 35 QIST fields — every one of them now has a count,
  because calls open to all disciplines count toward each field.

Two cards are worth checking by hand, because they test the new rule that a funder's own
country list beats our programme table:

- Open **Faculty for the Future**. With **My country = Kazakhstan** it must say
  *not eligible*; with **Uzbekistan**, *eligible*. The source link under the verdict should
  point at the Schlumberger Foundation's own eligibility PDF, not at our table.
- Open **TWAS–FAPESP**. Kazakhstan eligible, Georgia not.

**New file in this release: `assets/js/i18n.js`.** It holds the Kazakh, Russian and English
interface text and every page loads it before `app.js`. If it does not reach the server, the
whole site shows raw keys like `nav.home` — so check that the `assets/js/` folder went up with
three files in it, not two.

Switch the language with the ҚАЗ / РУС / ENG buttons in the header. The menu, the forms and the
match explanations change; the titles and conditions of the calls stay in the funder's own words,
which is deliberate and explained on the card.

First look at the header: it must read **ScienceBridge AI** with **BY QIST** as a small line
underneath, not in a box.

On the **home page**, change "I am based in" from Kazakhstan to the United States. The middle card
(Bolashak) must flip to a red verdict saying the United States is not on that programme's list.
If nothing changes, the JavaScript did not update.

On **Opportunities**, open any card's "Why this number" and check that each row gives a reason, and
that rows read from a published list carry a "source →" link.

Then open **For organizations** in the menu. Check three things:

- the switch at the top changes the headline between university and company;
- **See what expertise is in the network** shows cards with ••• instead of names — that is
  deliberate: organizations never see who a researcher is until that person agrees;
- fill the **Post a need** form with anything and send it — the submission must appear in your
  Formspree dashboard with `kind: org_need`. Do the same for **Book 30 minutes** and for
  **Create profile** in the header. Four kinds of message now arrive in that one inbox:
  `org_need`, `org_introduction`, `org_conversation`, `profile_request`.

Then open `curate.html` (there is a link at the top of `admin.html`). It should list all 20
records, and the **Add to the working list** button should be greyed out until you fill in a
valid record — the panel on the right says exactly what is missing.

Finally press **Interested** on any card. The button should change to **✓ Response sent**,
and the submission should appear in your Formspree dashboard.

## What is already configured

`assets/js/app.js` already contains your settings — you do not need to edit anything:

```js
INTEREST_ENDPOINT: 'https://formspree.io/f/xyezzgdo',
SIGNUP_ENDPOINT:   'https://formspree.io/f/xyezzgdo',
CONTACT_EMAIL:     'info@qista.org',
```

## About the browser cache

On 2026-09-18 the site looked broken while the server already held the correct files: the
HTML was new, but the browser was still running a cached copy of `app.js`. A hard reload
fixes that — `Ctrl+Shift+R` on Windows, `Cmd+Shift+R` on Mac.

From this release the problem is handled in code: every local script and stylesheet is
requested with a version marker, e.g. `assets/js/app.js?v=2026-09-20a`. A browser treats a
changed query string as a different file and must fetch it, so visitors stop getting a mix
of new HTML and old JavaScript.

**When you next change `app.js`, `globe.js` or `style.css`, bump the version in two places:**
`BUILD` at the top of `assets/js/app.js`, and every `?v=` value in the HTML files.
Forget it, and returning visitors may keep the old file for up to ten minutes.
