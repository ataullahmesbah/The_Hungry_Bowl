# Deployment

The Hungry Bowl is built to run **unchanged** on three kinds of hosting, so a
client can pick whatever they want later without the code needing a rewrite:

| Host | Works out of the box | Notes |
|---|---|---|
| **Vercel** (what you use now) | ✅ | `REALTIME_DRIVER=poll`, pooled `DATABASE_URL` |
| **VPS** (Ubuntu + Node + Nginx) | ✅ | `REALTIME_DRIVER=sse` allowed, PM2/systemd |
| **Docker / any container host** | ✅ | `BUILD_STANDALONE=true`, Dockerfile included |

What makes it portable — and the reasons each choice was made:

- **No Vercel-only APIs.** No edge-runtime KV, no Vercel Blob, no cron-only
  logic. Everything is Postgres + Cloudinary, which exist everywhere.
- **Realtime is a driver, not a dependency.** Polling (a plain DB read) works on
  serverless where a long-lived connection cannot; SSE is available for a
  long-running server. One env var switches it; no code change.
- **Media never passes through the server.** Uploads are signed and go straight
  to Cloudinary, so the 4.5 MB serverless body limit is irrelevant.
- **`output: 'standalone'` is opt-in** via `BUILD_STANDALONE=true`, so the same
  repo builds for Vercel and for Docker.
- **Migrations are explicit** (`npm run db:deploy`), never run automatically
  during a build — a build must never mutate a production database.

---

## 1. Vercel

### 1.1 Database

Use a Postgres with a connection pooler — Neon, Supabase, or Vercel Postgres.
Serverless functions open many short-lived connections; without a pooler you
will exhaust the connection limit under load.

- `DATABASE_URL` → the **pooled** connection string
- `DIRECT_URL` → the **direct** connection string (migrations only)

### 1.2 Project settings

| Setting | Value |
|---|---|
| Framework preset | Next.js (auto-detected) |
| Build command | `npm run build` (default) |
| Install command | `npm install` (default) |
| Node version | 20.x or 22.x |
| Region | pick the one nearest the restaurant — for Bangladesh, Singapore (`sin1`) |

`vercel.json` in the repo already sets the region and the security headers.

### 1.3 Environment variables

Paste every line from `.env.example` into **Settings → Environment Variables**,
with real values. Set them for **Production**, **Preview** and **Development**.

Required for a successful boot: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`,
`APP_URL`, `NEXT_PUBLIC_APP_URL`.

Must be `poll` on Vercel: `REALTIME_DRIVER=poll`.

### 1.4 First deploy

```bash
# after the first successful deploy, from your own machine,
# with production DATABASE_URL / DIRECT_URL in .env
npm run db:deploy
npm run db:seed
```

Then open `https://your-app.vercel.app/login`, sign in with the seed owner and
change the password.

### 1.5 Custom domain

Add the domain in Vercel, then update `APP_URL` and `NEXT_PUBLIC_APP_URL` to it
and redeploy — the sitemap, canonical URLs, OG tags and the origin check on API
mutations all read those values.

---

## 2. VPS (Ubuntu 22.04+)

### 2.1 Install

```bash
sudo apt update && sudo apt install -y curl git postgresql nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm i -g pm2
```

### 2.2 Database

```bash
sudo -u postgres psql
CREATE DATABASE hungry_bowl;
CREATE USER hb WITH ENCRYPTED PASSWORD 'a-strong-password';
GRANT ALL PRIVILEGES ON DATABASE hungry_bowl TO hb;
\c hungry_bowl
GRANT ALL ON SCHEMA public TO hb;
\q
```

`.env` on a VPS — `DIRECT_URL` is the same as `DATABASE_URL` because there is no
pooler in front:

```env
DATABASE_URL="postgresql://hb:a-strong-password@localhost:5432/hungry_bowl"
DIRECT_URL="postgresql://hb:a-strong-password@localhost:5432/hungry_bowl"
REALTIME_DRIVER="sse"
```

### 2.3 Build and run

```bash
git clone <your-repo> /var/www/hungry-bowl
cd /var/www/hungry-bowl
npm ci
npm run db:deploy
npm run db:seed
npm run build
pm2 start npm --name hungry-bowl -- start
pm2 save && pm2 startup
```

### 2.4 Nginx reverse proxy

```nginx
server {
  listen 80;
  server_name your-domain.com;

  location / {
    proxy_pass         http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade $http_upgrade;
    proxy_set_header   Connection 'upgrade';
    proxy_set_header   Host $host;
    proxy_set_header   X-Real-IP $remote_addr;
    proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header   X-Forwarded-Proto $scheme;
    proxy_cache_bypass $http_upgrade;

    # Server-sent events must not be buffered.
    proxy_buffering    off;
    proxy_read_timeout 3600s;
  }
}
```

```bash
sudo certbot --nginx -d your-domain.com     # HTTPS
```

> `X-Forwarded-Proto` matters: without it the session cookie's `Secure` flag and
> the origin check see plain HTTP and reject valid requests.

---

## 3. Docker

```bash
docker compose up -d --build
docker compose exec app npx prisma migrate deploy
docker compose exec app npx tsx prisma/seed.ts
```

`Dockerfile` builds with `BUILD_STANDALONE=true`, so the runtime image carries
only the server bundle, not the whole `node_modules`.
`docker-compose.yml` brings up Postgres alongside the app with a named volume,
so data survives `docker compose down`.

---

## 4. Upgrading an existing install

```bash
git pull
npm ci
npm run db:deploy     # applies any new migrations
npm run build
pm2 restart hungry-bowl        # or: docker compose up -d --build
```

Migrations are additive and are applied in order. **Never** run `prisma db push`
against a database that holds real data — it can drop columns without warning.

---

## 5. Backups

A restaurant's order and finance history is not reproducible. Back it up.

```bash
# nightly dump
pg_dump "$DATABASE_URL" -Fc -f /backups/hb-$(date +%F).dump

# restore
pg_restore -d "$DATABASE_URL" --clean --if-exists /backups/hb-2026-09-05.dump
```

Managed providers (Neon, Supabase) do this for you — check the retention window
and that point-in-time restore is actually enabled on your plan.

Cloudinary holds the media; it is a separate service with its own backup story.

---

## 6. Post-deploy checklist

- [ ] `/login` loads over HTTPS and the seed password has been changed
- [ ] `Settings → Restaurant`: country, currency, timezone and tax are correct
- [ ] `Payments → Methods`: only the methods this client actually uses are enabled
- [ ] A test order can be created, sent to the kitchen, paid and receipted
- [ ] Table session: seat a party, order twice, pay one bill, clear, seat again → **new bill**
- [ ] An image uploads from the dashboard (Cloudinary keys are right)
- [ ] `/sitemap.xml` and `/robots.txt` respond
- [ ] `SEED_OWNER_*` variables removed from the environment
- [ ] Database backups scheduled and one restore tested
