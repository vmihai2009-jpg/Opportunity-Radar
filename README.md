# BG Opportunity Radar

A Barr Gazetas–styled dashboard of architecture tenders, design competitions, public realm and heritage briefs in London and the South East.

- **Updates itself every 30 minutes.** A scheduled job on Netlify reads every source and saves the results. There's no AI involved: everything runs on fixed, editable rules.
- **Refresh now** button for an immediate check. It's limited to once every 2 minutes.
- **Monday briefing:** people sign up with their email and get the new London / Greater London opportunities from the past week every Monday at 7am (8am in summer).

## Sources

| Source | How it is read | Filter |
|---|---|---|
| Find a Tender (gov.uk) | Official OCDS data API | CPV **71000000** and every code beneath it (712… architecture, 714… planning, etc.), delivery in London / South East (plus UK-wide frameworks) |
| Contracts Finder (gov.uk) | Official OCDS data API | Same CPV and location filter, smaller contracts |
| AJ Competitions | AJ competitions page + Google News limited to architectsjournal.co.uk | Competition / appointment keywords |
| Dezeen | Dezeen RSS feed + Google News limited to dezeen.com | Competition / open call keywords |
| RIBA Competitions, London Festival of Architecture | Google News | Competition keywords |
| Heritage Network | Opportunities page | All listed briefs |
| Google News procurement searches | The searches from the original radar | Procurement keywords, no student competitions |

Plus the hand-researched starting list from 28 October 2026 (`lib/seeds.mjs`). Each entry drops off automatically once its deadline passes.

The **Sources** panel on the page shows when each source was last read and whether it worked. If a site changes or blocks the crawler, that source shows a red dot and the others carry on.

The first run looks back 14 days on Find a Tender and Contracts Finder. Each run reads up to about 20 seconds of notices, so the first backlog can take a few runs (an hour or two) to catch up. After that each run only reads what changed in the last 30 minutes.

## Putting it live on Netlify (one-off, about 15 minutes)

You need a free Netlify account and a free Resend account (for the emails).

1. **Connect the repo to Netlify.** In Netlify choose **Add new project → Import an existing project → GitHub**, then pick `vmihai2009-jpg/Opportunity-Radar`. Leave the settings it suggests (they come from `netlify.toml`) and press **Deploy**.
   *Don't use the drag-and-drop upload. That publishes the page but not the crawler, the timer or the emails.*
2. **Check it runs.** Open the site address Netlify gives you (something like `https://bg-opportunity-radar.netlify.app`) and press **Refresh now**. Within about 30 seconds the Sources panel should show green dots. From then on it updates by itself. In Netlify you can watch it under **Logs → Functions → crawl-scheduled**.
3. **Set up the emails.**
   1. Sign up at [resend.com](https://resend.com). Under **Domains**, add a domain you control, for example `barrgazetas-toolkit.co.uk`, and add the DNS records it shows you. Whoever manages that domain can do this in 5 minutes.
   2. In Resend, create an **API key**.
   3. In Netlify go to **Project configuration → Environment variables** and add:
      - `RESEND_API_KEY`: the key from Resend
      - `MAIL_FROM`: e.g. `BG Opportunity Radar <radar@barrgazetas-toolkit.co.uk>` (must be on the domain you verified)
      - `SITE_URL`: the radar's public address, e.g. `https://radar.barrgazetas-toolkit.co.uk`
   4. Go to **Deploys → Trigger deploy** so the new settings take effect.
   5. Sign up on the page with your own email, click the confirmation link, and you're on the list.
4. **Link it from the toolkit.** Ask whoever built barrgazetas-toolkit.co.uk to either:
   - add a button linking to the Netlify address, or
   - (tidier) in Netlify use **Domain management → Add a domain** with `radar.barrgazetas-toolkit.co.uk` and add the one DNS record Netlify asks for.

## Changing what it looks for

All rules are plain lists in these files:

- `lib/classify.mjs`: London / South East place names and postcodes, the keywords that sort items into Delivery / Feasibility / Competition / Public realm / Heritage, and the BG fit scoring.
- `lib/sources/press.mjs`: the press sources and Google News searches.
- `lib/sources/ocds.mjs`: the CPV filter (`CPV_PREFIX = '71'`) for the government APIs.
- `lib/seeds.mjs`: the hand-researched starting list.

Any change pushed to GitHub redeploys automatically.

## Files

```
public/index.html            The page (BG lime #E4EAA6 / sand #DBCFB4 / black, Barlow Condensed + serif)
netlify/functions/
  crawl-scheduled.mjs        Runs every 30 minutes
  refresh.mjs                The "Refresh now" button  (POST /api/refresh)
  radar.mjs                  Serves the data to the page (GET /api/radar)
  newsletter.mjs             Sign-up, confirm, unsubscribe (/api/newsletter/…)
  weekly-digest.mjs          Monday 07:00 UTC email
lib/                         Crawler, sources, rules, email content
test/                        Offline tests (npm test)
```

Subscriber emails are stored in Netlify Blobs (private to the site). Unsubscribing deletes the address.
