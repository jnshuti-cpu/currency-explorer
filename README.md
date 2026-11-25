# Currency Explorer

A web application for comparing live exchange rates across 160+ currencies. Pick a base currency, enter an amount, then search, filter and sort the results to see what it converts to everywhere else.

| | |
|---|---|
| **Live app (load balancer)** | http://`13.40.84.50` |
| **Web01** | http://`13.135.74.29`:3000 |
| **Web02** | http://`16.60.185.50`:3000 |
| **Demo video (under 2 min)** | https://youtu.be/eb7W2OhES3M |
| **Repository** | https://github.com/jnshuti-cpu/currency-explorer |

**Credentials:** the app has no login. The API key needed to run it is provided in the submission comment (it is deliberately not stored in this repository).

---

## Table of contents
1. [Purpose](#purpose)
2. [Features](#features)
3. [Tech stack](#tech-stack)
4. [Project structure](#project-structure)
5. [Run locally](#run-locally)
6. [Configuration](#configuration)
7. [API reference (this app)](#api-reference-this-app)
8. [Deployment to Web01 and Web02](#deployment-to-web01-and-web02)
9. [Load balancer setup (Lb01)](#load-balancer-setup-lb01)
10. [Testing](#testing)
11. [Updating without downtime](#updating-without-downtime)
12. [Security notes](#security-notes)
13. [Challenges and solutions](#challenges-and-solutions)
14. [Credits](#credits)

---

## Purpose
Anyone who travels, sends money abroad, shops internationally or runs a business with foreign suppliers needs quick, trustworthy exchange rates. Most converters answer one pair at a time. Currency Explorer shows one base currency against every other currency at once and lets you narrow the list instantly, for example "all currencies worth more than my base" or "just the major ones".

## Features
- **Live rates** for 160+ currencies from ExchangeRate-API
- **Convert** any amount from any base currency
- **Search** by currency code or name
- **Filter**: all, major currencies, worth more than the base, worth less than the base
- **Sort**: by code (A-Z), name (A-Z) or value (high-low, low-high)
- **Server-side caching** (default 60 minutes) to cut latency and API usage
- **Graceful failure**: if the rates API is unreachable, the last cached data is served and the page says so. If nothing is cached, a clear error banner is shown
- **Load balancer visibility**: every response carries an `X-Served-By` header and the page footer shows which server answered
- **Health endpoint** (`/health`) used by the load balancer
- Light and dark mode, keyboard-accessible controls, responsive layout

## Tech stack
- Node.js 18+ and [Express](https://expressjs.com) (server and API proxy)
- Vanilla HTML, CSS and JavaScript (front end, no build step)
- [dotenv](https://github.com/motdotla/dotenv) for configuration
- HAProxy for load balancing (an Nginx alternative is included)

## Project structure
```
currency-explorer/
├── public/
│   ├── index.html     # page markup
│   ├── app.js         # fetch, search, filter, sort, render
│   └── style.css      # styling (light and dark)
├── server.js          # Express server, API proxy, cache, health check
├── package.json
├── package-lock.json
├── .env.example       # template for your local .env (no real secrets)
├── .gitignore         # excludes .env and node_modules
└── README.md
```

## Run locally
**Requirements:** Node.js 18 or newer, Git, and an ExchangeRate-API key.

```bash
git clone https://github.com/jnshuti-cpu/currency-explorer.git
cd currency-explorer
npm install
cp .env.example .env     # then open .env and paste your API key
npm start
```
Open http://localhost:3000.

Get your own free key at https://app.exchangerate-api.com/sign-up, or use the key from the submission comment.

## Configuration
Settings live in a `.env` file, which is never committed.

| Variable | Required | Default | Description |
|---|---|---|---|
| `EXCHANGE_API_KEY` | yes | none | ExchangeRate-API key. The server exits with a message if it is missing |
| `PORT` | no | `3000` | Port the server listens on |
| `CACHE_TTL_MINUTES` | no | `60` | How long API responses are cached |

## API reference (this app)
The browser talks only to these endpoints. The ExchangeRate-API key is never exposed to it.

| Endpoint | Description |
|---|---|
| `GET /api/rates?base=USD` | Rates for a 3-letter base code. Returns `base`, `updated`, `rates`, `cached`, `stale`. Responds `400` for an invalid code |
| `GET /api/codes` | List of supported currency codes and names |
| `GET /health` | `{"status":"ok","host":"...","uptime":...}` for health checks |

Upstream failures return `502` or `503` with a friendly JSON error.

## Deployment to Web01 and Web02
Repeat these steps on **both** servers.

1. **Connect:** `ssh -i ~/.ssh/school ubuntu@13.135.74.29` (Web01), then repeat with `16.60.185.50` (Web02)
2. **Install Node.js 18+ and Git.** Check with `node -v`. On Ubuntu/Debian, if the packaged version is older than 18, install a newer one from [NodeSource](https://github.com/nodesource/distributions).
   ```bash
   sudo apt update && sudo apt install -y git nodejs npm
   ```
3. **Get the code**
   ```bash
   sudo mkdir -p /opt/currency-explorer && sudo chown $USER /opt/currency-explorer
   git clone https://github.com/jnshuti-cpu/currency-explorer.git /opt/currency-explorer
   cd /opt/currency-explorer
   npm install --omit=dev
   ```
4. **Create the environment file** (secrets stay on the server)
   ```bash
   cp .env.example .env
   nano .env          # set EXCHANGE_API_KEY
   chmod 600 .env
   ```
5. **Run as a service** so it restarts on crash and on reboot. Create `/etc/systemd/system/currency-explorer.service`, replacing `User` with your login user:
   ```ini
   [Unit]
   Description=Currency Explorer
   After=network.target

   [Service]
   WorkingDirectory=/opt/currency-explorer
   ExecStart=/usr/bin/node server.js
   EnvironmentFile=/opt/currency-explorer/.env
   Restart=always
   User=ubuntu

   [Install]
   WantedBy=multi-user.target
   ```
   Check the Node path with `which node` and adjust `ExecStart` if needed. Then:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable --now currency-explorer
   sudo systemctl status currency-explorer
   ```
6. **Verify:** `curl http://localhost:3000/health` should return `{"status":"ok",...}`. Also open `http://13.135.74.29:3000 (Web01) or http://16.60.185.50:3000 (Web02)` from your own computer. If it does not load, open the port: `sudo ufw allow 3000/tcp (Web02 has no ufw, so this step is only needed where ufw is installed)`.

## Load balancer setup (Lb01)
Lb01 (`13.40.84.50`) already ran HAProxy with a `www-http` frontend on port 80 and a `www-backend` backend pointing at port 80 on both web servers. I edited the existing config rather than adding a second frontend, which would conflict on port 80.

```bash
ssh -i ~/.ssh/school ubuntu@13.40.84.50
sudo cp /etc/haproxy/haproxy.cfg /etc/haproxy/haproxy.cfg.bak   # backup
sudo nano /etc/haproxy/haproxy.cfg
```
Final frontend and backend sections (the `global` and `defaults` sections are unchanged):
```
frontend www-http
    bind *:80
    default_backend www-backend

backend www-backend
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server 7371-web-01 13.135.74.29:3000 check
    server 7371-web-02 16.60.185.50:3000 check
```
Validate and apply:
```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
sudo systemctl restart haproxy
sudo systemctl status haproxy
```
What changed: the server ports went from 80 to 3000 (where the app listens), and the health check makes HAProxy poll `/health` on each server, stop sending traffic to one that fails and resume when it recovers. `balance roundrobin` alternates requests between the two servers.

<details>
<summary>Nginx alternative</summary>

```nginx
upstream app_servers {
    server 13.135.74.29:3000;
    server 16.60.185.50:3000;
}
server {
    listen 80;
    location / {
        proxy_pass http://app_servers;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```
</details>

## Testing
**Local checks**
- Rates load; search, filter, sort, amount and base currency all update the table
- `curl "http://localhost:3000/api/rates?base=12"` returns a 400 error message
- With a wrong key in `.env`, the page shows an error banner instead of crashing

**Load balancing**
```bash
for i in $(seq 1 6); do
  curl -s -D - -o /dev/null http://13.40.84.50/health | grep -i x-served-by
done
```
The hostname should alternate between Web01 and Web02. The footer of the page shows the same information when you refresh.

**Failover**
1. On Web01: `sudo systemctl stop currency-explorer`
2. Repeat the loop above: only Web02 should answer, with no errors.
3. On Web01: `sudo systemctl start currency-explorer`. Both should answer again.

Test results (run from my laptop against the load balancer, `13.40.84.50`):

Normal operation, six requests alternate between the two servers:
```
x-served-by: 7371-web-01
x-served-by: 7371-web-02
x-served-by: 7371-web-01
x-served-by: 7371-web-02
x-served-by: 7371-web-01
x-served-by: 7371-web-02
```
Failover, after stopping the app on Web01 (`sudo systemctl stop currency-explorer`), all six requests were served by Web02 with no errors:
```
x-served-by: 7371-web-02
x-served-by: 7371-web-02
x-served-by: 7371-web-02
x-served-by: 7371-web-02
x-served-by: 7371-web-02
x-served-by: 7371-web-02
```
Recovery, after restarting Web01 (`sudo systemctl start currency-explorer`), traffic alternated between both servers again:
```
x-served-by: 7371-web-02
x-served-by: 7371-web-01
x-served-by: 7371-web-02
x-served-by: 7371-web-01
x-served-by: 7371-web-02
x-served-by: 7371-web-01
```

## Updating without downtime
Update one server at a time so the other keeps serving traffic:
```bash
cd /opt/currency-explorer
git pull
npm install --omit=dev
sudo systemctl restart currency-explorer
```
HAProxy's health checks route traffic to the healthy server during the restart. Then repeat on the second server.

## Security notes
- The API key is kept in `.env` (git-ignored) and used only on the server
- Query input is validated (`base` must be three letters)
- Responses set a Content-Security-Policy, `X-Content-Type-Options`, `X-Frame-Options` and `Referrer-Policy`
- The front end writes data to the page with `textContent`, which prevents injected HTML or scripts
- `.env` files on the servers are set to `chmod 600`

## Challenges and solutions
- **Keeping the API key out of the browser and the repo.** ExchangeRate-API places the key in the request URL, so calling it from client-side JavaScript would expose it. I added a server-side proxy so the browser only calls `/api/...`. I also keep the key in `.env` and check `git status` and `git diff --cached` before each commit; I caught the key in `.env.example` before pushing and restored the placeholder.
- **API quota and downtime.** An in-memory cache with a time limit reduces API calls, and serving stale data when the API fails keeps the app usable.
- **Showing that load balancing works.** I added the `X-Served-By` header and a footer label so each response shows which server handled it.
- **Missing runtime on the servers:** Node.js was not installed on Web01 or Web02. On Web02 the service failed with `status=203/EXEC` until I installed Node 20 from NodeSource and reran `npm install`.
- **Firewall:** Web01's `ufw` only allowed ports 22, 80 and 443, so I opened 3000 with `sudo ufw allow 3000/tcp`.
- **Existing load balancer config:** Lb01 already had a frontend on port 80 pointing at port 80 on both servers, so I edited its backend to use port 3000 and added a `/health` check instead of adding a second frontend.
- **Git conflict on the README:** an edit on GitHub clashed with my local README, so I resolved the conflict during a rebase and kept my version.

## Credits
- **Exchange rate data:** [ExchangeRate-API](https://www.exchangerate-api.com/docs/overview). Thank you to the ExchangeRate-API team for the free API.
- **Libraries:** [Express](https://expressjs.com), [dotenv](https://github.com/motdotla/dotenv)
- **Fonts:** Fraunces and IBM Plex Sans via [Google Fonts](https://fonts.google.com)
- **Load balancing:** [HAProxy](https://www.haproxy.org)
- **AI assistance:** starter code and README structure were drafted with Claude (Anthropic). Edit or remove this line so it accurately describes what you did and what your course policy requires.
