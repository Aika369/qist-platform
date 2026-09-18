# QIST Platform

The community platform of **QIST — Qazaq International Science and Technology Association** ([qista.org](https://qista.org)): the global network of PhD students, postdocs, professors and industry scientists from Kazakhstan.

**Live site:** https://zangir.github.io/qist-platform/

## Features

- 🗺️ **Researcher map** — interactive world map (Leaflet + clustering) of community members, filterable by name, topic and country
- 🔎 **People directory** — search by research topic, career stage, country of work and years of experience
- 📢 **Channels** — on-platform boards: Jobs & Vacancies, Research Grants, Conferences & Events, Collaboration Requests, General Discussion
- 🤝 **Academic matching** — enter your interests and goal (co-author / mentor / mentee) and get ranked collaborator suggestions with match scores
- 📮 **QIST newsletter** — digest issues published on-site with email subscription
- 🔐 **Accounts** — participant registration/login plus an admin panel (manage researchers, moderate posts, view subscribers and collaboration requests)

## Architecture

Two modes, one data contract:

1. **Static mode (GitHub Pages, default)** — the frontend runs entirely from `data/*.json`; user-created records (accounts, posts, subscriptions, collaboration requests, admin edits) are kept in the browser's `localStorage`. Zero infrastructure, ideal for the first version.
2. **API mode (Python backend)** — the FastAPI app in [`backend/`](backend/) serves the same endpoints with a real SQLite database, hashed passwords and JWT auth. Point the frontend at it with `localStorage.setItem('qist_api_url', 'https://your-api')` and everything becomes shared and persistent. See [backend/README.md](backend/README.md).

## Demo accounts (static mode)


## Local development

Static site: any web server from the repo root, e.g. `python3 -m http.server 8080`.

Backend: see [backend/README.md](backend/README.md).

## Data

`data/people.json` seeds the directory/map with publicly known Kazakhstani researchers compiled from public sources (university pages, Google Scholar). To add, correct or remove an entry, open an issue or PR — or use the admin panel.

---

## Opportunities и право участия (итерация 1, 18.09.2026)

Раздел `opportunities.html` показывает структурированные возможности и для каждой —
вердикт о праве участия для выбранной пользователем страны.

### Как добавить возможность

Отредактируйте `data/opportunities.json` и закоммитьте. Обязательные поля:

```json
{
  "id": "o-2026-11-widera",
  "type": "grant",
  "status": "published",
  "title": "...",
  "organization": "...",
  "country": "KZ",
  "summary": "...",
  "fields": ["Materials Science"],
  "career_stage": "phd_plus",
  "eligibility": { "programme": "horizon_europe", "note": "" },
  "funding_status": "confirmed",
  "deadline": "2026-11-12",
  "source_url": "https://..."
}
```

- `type`: `grant` · `consortium_role` · `academic_job` · `industry_job` · `coauthor` · `rnd_challenge` · `expert_request` · `conference`
- `career_stage`: `any` · `phd_student` · `phd_plus` · `postdoc_plus` · `pi_only`
- `funding_status`: `confirmed` · `not_confirmed` · `cofunding_required`
- `eligibility.programme`: `horizon_europe` · `kz_national` · `open`

**Правило источника:** `source_url` обязателен. Возможность без ссылки на первоисточник
не публикуется — иначе нечем подтвердить условия.

### Откуда берётся вердикт

Из `data/eligibility.json`. Для Horizon Europe статусы девяти стран взяты из
[List of Participating Countries in Horizon Europe](https://ec.europa.eu/info/funding-tenders/opportunities/docs/2021-2027/common/guidance/list-3rd-country-participation_horizon-euratom_en.pdf),
Европейская комиссия, v4.0 от 31.07.2026.

Вердикт **никогда не вычисляется моделью**. При обновлении списка ЕС правьте
`source_version` и `source_date` вместе со статусами — они показываются пользователю.

### Wiring up responses — three fields in `assets/js/app.js`

```js
INTEREST_ENDPOINT: '',   // where "Interested" on an opportunity goes
SIGNUP_ENDPOINT:   '',   // where pilot sign-ups from the home page go
CONTACT_EMAIL:     '',   // address behind "remove my profile" on about.html
```

While a field is empty the matching control **disables itself and says so**. Nothing is
written to `localStorage`: we do not collect data into a place we cannot read it from.

#### Use Formspree, not Tally

Checked on 2026-09-18: **Tally will not work here.** Its API only creates and manages forms
and requires a secret bearer token, so a static page cannot submit a response without
exposing that key. There is no public client-side submission endpoint.

Services that do accept a cross-origin JSON `POST` from a static page:

| Service | Endpoint shape | Free tier |
|---|---|---|
| **Formspree** | `https://formspree.io/f/{id}` | 50 submissions/month |
| Web3Forms | `https://api.web3forms.com/submit` | unlimited, needs `access_key` in the body |
| Basin, Getform, Formcarry | similar | varies |

Setting up Formspree, start to finish:

1. Create a form at formspree.io and copy its endpoint, e.g. `https://formspree.io/f/xyzabcd`.
2. Paste it into both `INTEREST_ENDPOINT` and `SIGNUP_ENDPOINT` (one form can receive both;
   each payload carries a `kind` field — `opportunity_interest` or `pilot_signup`).
3. Set `CONTACT_EMAIL` to the address that should receive data-removal requests.
4. Commit. Nothing else changes.

`QIST.submitForm()` already sends `Accept: application/json` — without that header Formspree
answers with an HTML redirect instead of JSON and the success check fails.

`mailto:address` also works as an endpoint value: it opens the user's mail client with the
payload prefilled. No account needed anywhere, but it needs the visitor to press send.

### Country eligibility data

`data/eligibility.json` holds all 250 ISO countries with a Horizon Europe status each:

- `eu_member` — EU Member State (27)
- `associated` — Associated Country (23), same rights as EU Member States
- `funded` — third country automatically eligible for EU funding (116)
- `self_funded` — participation possible, normally at own cost (84)

Source: European Commission, *List of Participating Countries in Horizon Europe*, v4.0 of
2026-07-31. The lists were extracted by automated reading of that PDF on 2026-09-18 —
`eligibility.json` records this in its `verification` block. **Spot-check the nine priority
countries against the source before a public launch**, and record who did it in
`verification.reviewed_by`.

## Структура разделов

| Раздел | Файл | Что внутри |
|---|---|---|
| Home | `index.html` | Оффер, глобус, подписка |
| Opportunities | `opportunities.html` | Все возможности, любого типа и от любого отправителя |
| Researchers | `directory.html` + `map.html` | Один набор людей, три вида: список, карта, глобус |
| About QIST | `about.html` | Происхождение данных, приватность, удаление профиля |

Не в меню намеренно: `matching.html` (персонально — переедет в «My matches» за входом),
`channels.html` (обсуждения сообщества, ссылка из about), `newsletter.html` (архив, ссылка из about).

## Документы проекта

`PRD.md` — требования · `ROADMAP.md` — этапы · `DECISIONS.md` — решения и причины ·
`BACKLOG.md` — задачи с приоритетами · `STATUS.md` — что работает и что ограничено.
