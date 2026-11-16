# PrepApp sync server (Raspberry Pi)

The Pi runs two containers:

| Container | Job                                                                                                                                                          |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `caddy`   | The only thing devices talk to. HTTPS with a Let's Encrypt certificate (obtained through DNS, so no router ports are opened), CORS for the app, path filter. |
| `couchdb` | The household database. Listens only inside the Pi.                                                                                                          |

It is **home network only**: nothing is forwarded on the router. Away from home, connect with OpenVPN first.

## 1. Prepare the Pi

1. 64-bit Raspberry Pi OS, updated.
2. Docker with the compose plugin: `curl -fsSL https://get.docker.com | sh`, then `sudo usermod -aG docker $USER` and log in again.
3. Give the Pi a **fixed address**: in the TP-Link router, add a DHCP address reservation for the Pi (for example `192.168.0.50`).

## 2. DNS record and API token

The certificate is for `prep.mulras.uk`. Create these at the company that runs DNS for `mulras.uk`.

**DNS record:** type `A`, name `prep`, value = the Pi's fixed address (for example `192.168.0.50`).

- On Cloudflare, set the record to **DNS only** (grey cloud), not proxied.

**API token** (lets Caddy prove you own the domain):

- **Cloudflare:** My Profile → API Tokens → Create Token → template _Edit zone DNS_ → Zone Resources: _Include → Specific zone → mulras.uk_. Put the token in `CLOUDFLARE_API_TOKEN` and set `DNS_PROVIDER=cloudflare`.
- **Porkbun:** Account → API Access → create a key and secret; then on the domain's settings turn on _API Access_. Put them in `PORKBUN_API_KEY` / `PORKBUN_API_SECRET_KEY` and set `DNS_PROVIDER=porkbun`.

The token only ever lives in `server/.env` on the Pi. Never commit it.

## 3. Configure and start

```sh
git clone https://github.com/smulrain-lgtm/PrepApp.git
cd PrepApp/server
cp .env.example .env
openssl rand -base64 24   # run twice: one for the admin password, one for the sync password
nano .env                 # fill in every value
docker compose up -d --build
docker compose logs -f caddy   # wait for "certificate obtained successfully", then Ctrl+C
./setup-couchdb.sh
```

## 4. Check it works

From a laptop or phone **on the home Wi-Fi**:

- Open `https://prep.mulras.uk/_up` → shows `{"status":"ok"}` with a valid padlock.
- Open `https://prep.mulras.uk/_utils/` → `Not found` (the admin console is blocked, as intended).

If `prep.mulras.uk` does not load at home but `nslookup prep.mulras.uk` from outside shows the Pi's address, the router is blocking DNS answers that point at a home address (DNS rebinding protection). Allow `mulras.uk` in the router's DNS settings, or point the devices' DNS at a resolver that allows it.

Then in the app, on each device: **Settings → Sync with the Pi**:

| Field          | Value                                                   |
| -------------- | ------------------------------------------------------- |
| Sync addresses | `https://prep.mulras.uk` (one per line, tried in order) |
| Database       | `prepapp` (the `COUCHDB_DB` value)                      |
| Username       | `household` (the `COUCHDB_SYNC_USER`)                   |
| Password       | the `COUCHDB_SYNC_PASSWORD` from `.env`                 |

Tap **Save**, then **Test connection**: it should say _Success: Connected_. Then turn on **Sync this device**. The badge at the top of every screen shows _Syncing…_, then _Synced 14:32_. Tap it to open Settings, then **Sync with the Pi**.

Sync runs while the app is open. iOS gives web apps no background time, so a device catches up each time PrepApp is opened.

**Updating the Pi after a new release:** `cd ~/PrepApp && git pull && cd server && docker compose up -d --build caddy` (only needed when `server/` changed). The last server change was in app version 0.4.0 (Caddy allows `GET /`); releases 1.0.0 to 1.3.1 need no Pi update (new record types such as lists sync through the existing database with no server change).

**Away from home:** connect OpenVPN, then test again. The VPN must route the home network's addresses and use a DNS server that resolves `prep.mulras.uk`.

## Fallback: certificate without a domain

Set `DNS_PROVIDER=internal` in `.env` and restart (`docker compose up -d`). Caddy then issues its own certificate, which each device must trust:

```sh
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./prepapp-root.crt
```

Send `prepapp-root.crt` to each iPhone/iPad (AirDrop or email), install the profile (Settings → Profile Downloaded), then turn on full trust under Settings → General → About → Certificate Trust Settings.

## Maintenance

- Data lives in `server/data/couchdb/`. The app's JSON export is the household backup; copy this folder too if you want a server-side backup.
- Update: `git pull && docker compose pull && docker compose up -d --build`.
- Never forward port 443 (or any port) to the Pi on the router.
