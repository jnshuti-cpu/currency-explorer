# Currency Explorer

A web app for comparing live exchange rates across 160+ currencies. Search by code or name, filter (major currencies, stronger/weaker than the base), sort by code, name or value, and convert any amount from any base currency.

- **Demo video:** `<ADD LINK>`
- **Live app (load balancer):** `http://<LB01_IP_OR_DOMAIN>`
- **Web01:** `http://<WEB01_IP>:3000` · **Web02:** `http://<WEB02_IP>:3000`

## Features
- Live rates via ExchangeRate-API, proxied through the server so the **API key is never sent to the browser**
- Search, filter, sort, amount conversion, base-currency switching
- Server-side caching (default 60 min) with **stale-cache fallback** if the API is down
- Error handling: invalid input (400), upstream failure (502/503) shown as a friendly banner
- Security: input validation, CSP and other headers, XSS-safe rendering (`textContent`)
- `X-Served-By` header and footer text show which server answered, so load balancing is visible
- `/health` endpoint

## API used and credit
**[ExchangeRate-API](https://www.exchangerate-api.com/docs/overview)** – exchange rate data (v6). Thanks to the ExchangeRate-API team.
Libraries: [Express](https://expressjs.com), [dotenv](https://github.com/motdotla/dotenv). Fonts: Fraunces and IBM Plex Sans (Google Fonts). Load balancing: [HAProxy](https://www.haproxy.org) (or Nginx).

## Run locally
Requires Node.js 18+.
```bash
git clone https://github.com/<you>/currency-explorer.git
cd currency-explorer
npm install
cp .env.example .env      # then edit .env and add your key
npm start                 # http://localhost:3000
```
Get a free key at https://app.exchangerate-api.com/sign-up. Keys for graders are supplied in the submission comment, not in this repo.

## Deploy to Web01 and Web02
Repeat on **both** servers (SSH in as your user):
```bash
# 1. Install Node 18+ and git
sudo apt update && sudo apt install -y git nodejs npm   # ensure `node -v` >= 18 (use NodeSource if older)

# 2. Get the code
sudo mkdir -p /opt/currency-explorer && sudo chown $USER /opt/currency-explorer
git clone https://github.com/<you>/currency-explorer.git /opt/currency-explorer
cd /opt/currency-explorer && npm install --omit=dev

# 3. Configure secrets (not in git)
cp .env.example .env && nano .env && chmod 600 .env
```
Run as a service so it survives reboots. Create `/etc/systemd/system/currency-explorer.service`:
```ini
[Unit]
Description=Currency Explorer
After=network.target

[Service]
WorkingDirectory=/opt/currency-explorer
ExecStart=/usr/bin/node server.js
Restart=always
User=ubuntu
EnvironmentFile=/opt/currency-explorer/.env

[Install]
WantedBy=multi-user.target
```
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now currency-explorer
curl http://localhost:3000/health
```
(If the servers only expose port 80, set `PORT=80` or put Nginx in front, proxying to `127.0.0.1:3000`.)

## Configure the load balancer (Lb01, HAProxy)
```bash
sudo apt update && sudo apt install -y haproxy
sudo nano /etc/haproxy/haproxy.cfg
```
Append:
```
frontend http_in
    bind *:80
    mode http
    default_backend app_servers

backend app_servers
    mode http
    balance roundrobin
    option httpchk GET /health
    http-check expect status 200
    server web01 <WEB01_IP>:3000 check
    server web02 <WEB02_IP>:3000 check
```
```bash
sudo haproxy -c -f /etc/haproxy/haproxy.cfg   # validate
sudo systemctl restart haproxy
```
`balance roundrobin` alternates requests; `check` + `option httpchk` removes a server from rotation if `/health` fails and re-adds it when it recovers.

<details><summary>Nginx alternative</summary>

```nginx
upstream app_servers { server <WEB01_IP>:3000; server <WEB02_IP>:3000; }
server { listen 80; location / { proxy_pass http://app_servers; proxy_set_header Host $host; proxy_set_header X-Real-IP $remote_addr; } }
```
</details>

## Test the load balancer
```bash
for i in $(seq 1 6); do curl -s -D - -o /dev/null http://<LB01_IP>/health | grep -i x-served-by; done
```
Expect hostnames to alternate between web01 and web02. Failover test: `sudo systemctl stop currency-explorer` on web01, repeat the loop (only web02 should answer, no errors), then restart it and confirm both return. Record this in the demo video.

## Updating (zero downtime)
Deploy to one server at a time: `git pull && npm install --omit=dev && sudo systemctl restart currency-explorer`. HAProxy health checks route traffic to the other server meanwhile.

## Challenges and solutions
- **Hiding the API key:** ExchangeRate-API puts the key in the URL, so calling it from the browser would leak it. Solved with a server-side proxy.
- **Rate limits / API downtime:** Added an in-memory cache with TTL and a stale fallback.
- **Proving load balancing:** Added the `X-Served-By` header and footer text.
- *(Add your own real challenges here, e.g. Node version on the servers, firewall ports.)*

## Credentials for graders
No login required. API key and any server access details are in the submission comment.
