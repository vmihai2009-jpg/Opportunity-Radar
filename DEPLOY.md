# Deploying the BG Opportunity Radar (for the server administrator)

The radar is one small Node.js web application. It serves the web page, checks its sources every
30 minutes, and sends a weekly email. No database is needed: data is kept as JSON files in one folder.

**Needs:** Linux server (or any OS) with **Docker**, *or* **Node.js 18.17+** (22 LTS recommended).
Outbound HTTPS (port 443) to the sites listed at the end. About 100 MB of disk and 256 MB of RAM.

---

## 1. Configure

```bash
unzip BG_Opportunity_Radar_v3.zip && cd BG_Opportunity_Radar_v3
cp .env.example .env
nano .env        # fill in SITE_URL and ONE email option (company SMTP or Resend)
```

For Microsoft 365 the usual values are `SMTP_HOST=smtp.office365.com`, `SMTP_PORT=587`, and the
mailbox's address and password (or an app password) as `SMTP_USER` / `SMTP_PASS`. SMTP AUTH must
be enabled for that mailbox. `MAIL_FROM` must be that mailbox (or one it may send as).

If the server reaches the internet through a proxy, set `HTTPS_PROXY` in `.env`.

## 2a. Run with Docker (recommended)

```bash
docker compose up -d --build
docker compose logs -f          # watch the first scan
```

Data lives in the Docker volume `radar-data`, so it survives restarts and updates.

## 2b. Or run with Node.js directly

```bash
npm ci --omit=dev
npm run build
npm start                       # test it; Ctrl+C to stop
```

To keep it running permanently, use the systemd unit in `deploy/bg-radar.service`
(edit the path and user first), or `pm2 start server.mjs --name bg-radar`.

## 3. Put HTTPS in front

The app listens on port 8080 (plain HTTP). Publish it through your normal web server or reverse proxy
with HTTPS. `deploy/nginx-example.conf` is a ready example. A subdomain such as
`radar.barrgazetas-toolkit.co.uk` works well; set the same address as `SITE_URL` in `.env`.

## 4. Check it works

```bash
npm run check                   # Docker: docker compose exec radar npm run check
```

This reads every source live and prints one line each, `OK` or `FAIL` with the reason. The exit code is 1
if any source fails, so it can be scheduled in monitoring.

Then open the site. The bar under the title should say **"Live · sources last checked …"**, and the
**Sources** panel should show green dots. The **first scan takes about 5–15 minutes** because it reads the
last 30 days of government notices. Later scans take seconds.

Health endpoint for monitoring: `GET /api/health` returns `200` when the last scan is recent, and `503`
if no scan has completed for over an hour. It also lists any failing sources.

## Updating

Replace the files (keep `.env` and the data folder/volume), then `docker compose up -d --build`
(or `npm ci --omit=dev && npm run build` and restart the service).

## Backups

Back up the data folder (`./data`, or the `radar-data` Docker volume). It holds the opportunity list and
the newsletter subscriber list (email addresses, so treat it as personal data).

## If a source fails

`npm run check` prints the reason for each failure:

| Message | Meaning / fix |
|---|---|
| `ENOTFOUND`, `fetch failed`, `timed out` | The server cannot reach that site. Allow outbound HTTPS to it in the firewall, or set `HTTPS_PROXY`. |
| `HTTP 403` | The site refused the request (often a firewall/proxy that blocks it, or the site blocks the server's IP range). |
| `HTTP 429` | Rate limited. The radar waits and retries by itself; it clears on the next run. |
| `not a feed` | The site returned a web page instead of its RSS feed (usually a temporary block or cookie wall). |

A failing source never empties the radar. The opportunities it found earlier stay listed, and the other
sources carry on.

## Sites the server must be able to reach (outbound HTTPS)

- www.find-tender.service.gov.uk
- www.contractsfinder.service.gov.uk
- news.google.com
- www.dezeen.com
- competitions.archi
- feeds.feedburner.com, www.archdaily.com
- www.riba.org
- www.londonfestivalofarchitecture.org
- www.heritagenetwork.org.uk
- fonts.googleapis.com / fonts.gstatic.com (the page's fonts, loaded by visitors' browsers)
- api.resend.com (only if using Resend for email)
