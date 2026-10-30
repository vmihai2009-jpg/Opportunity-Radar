# BG Opportunity Radar

A Barr Gazetas–styled dashboard of architecture tenders, design competitions, public realm and heritage briefs, focused on London and the South East, with UK-wide and international competitions available through the Location filter.

- **Updates itself every 30 minutes**, using fixed rules only. There's no AI involved.
- **Refresh now** button for an immediate check.
- **Sources panel** shows, for every source, whether it was read successfully and how many opportunities it currently has on the radar.
- **Monday briefing:** people sign up with their email and every Monday at 7am (London time) get the new London / Greater London opportunities from the past week. Double opt-in, one-click unsubscribe.

**To install it on a server, see [DEPLOY.md](DEPLOY.md).** It covers Docker or plain Node.js, about 15 minutes.

## Sources and how each is read

| Source | Method | What is kept |
|---|---|---|
| **Find a Tender** (gov.uk) | Official data API, read in small time windows (tender and pipeline stages), plus a check of each new notice number so none is skipped | CPV **71000000** family (every code starting 71), delivery in London / South East, plus UK-wide frameworks |
| **Contracts Finder** (gov.uk) | Official data API, same method | Same CPV and location rules |
| **AJ Competitions** | Google News, limited to architectsjournal.co.uk (AJ blocks direct crawling, and its own competitions page is a 2014 archive) | Competition / "architect sought" / open call items |
| **Dezeen** | Dezeen's RSS feed plus Google News limited to dezeen.com | Competitions and open calls |
| **Competitions.archi** | RSS feed, first 4 pages (about 3 months) | Open international competitions (results are dropped) |
| **Bustler** | Competitions page plus Google News | Open competitions (winners dropped) |
| **Malcolm Reading Consultants** | Homepage links to its competition sites plus Google News | Major invited / open competitions (check if still open) |
| **UIA** | RSS feed plus Google News | Open calls and awards |
| **UNI (uni.xyz)** | Competitions page | Open ideas competitions |
| **Young Architects Competitions** | Homepage | Open calls only |
| **ArchDaily** | RSS feed | Competition items |
| **RIBA Competitions** | riba.org/explore/competitions page plus Google News | RIBA-run competitions |
| **London Festival of Architecture** | LFA competitions page plus Google News | Only items that read as open calls (the page mostly lists past projects) |
| **Heritage Network** | Opportunities page, with the deadline read from each listing | Design / conservation / survey briefs (not trustee or staff jobs) |
| **News procurement searches** | Google News searches | Procurement and competition leads |
| **Competition searches** | Google News searches over 60 days | Newly launched UK and international competitions |

Plus the hand-researched starting list from 28 October 2026 (`lib/seeds.mjs`).

**How it stays reliable:**
- Every request is retried automatically when a site is slow, busy or briefly down.
- Most sources have two channels, so one can fail and the source still works.
- If a whole source is down, the opportunities it found earlier stay on the radar and the others carry on.
- Articles that appear through several sources are shown once.

**Location filter:** London + South East (default), London, South East, UK-wide frameworks, Elsewhere in the UK, International, Everything.

## Changing what it looks for

The rules are plain lists you can edit:

- `lib/classify.mjs`: place names and postcodes for each region, the keywords that sort items into Delivery / Feasibility / Competition / Public realm / Heritage, and the BG fit scoring.
- `lib/sources/press.mjs`: press sources, feeds and searches.
- `lib/sources/ocds.mjs`: the CPV filter (`CPV_PREFIX = '71'`) for the government APIs.
- `lib/seeds.mjs`: the hand-researched starting list.

## For developers

```
server.mjs                  web server + 30-minute timer + Monday email timer
public/index.html           the page (BG lime #E4EAA6 / sand #DBCFB4 / black; Barlow Condensed + serif)
lib/crawler.mjs             runs all sources, merges, de-duplicates, prunes
lib/sources/ocds.mjs        Find a Tender + Contracts Finder
lib/sources/press.mjs       press / competition sources
lib/newsletter*.mjs         sign-up, confirm, unsubscribe, Monday email (SMTP or Resend)
lib/file-store.mjs          JSON file storage in DATA_DIR
scripts/check-sources.mjs   npm run check: live test of every source
scripts/crawl-once.mjs      npm run crawl: one crawl from the command line
test/                       npm test: offline tests with simulated sources
```

API: `GET /api/radar`, `POST /api/refresh`, `GET /api/health`, `POST /api/newsletter/subscribe`, `GET /api/newsletter/confirm|unsubscribe`.
