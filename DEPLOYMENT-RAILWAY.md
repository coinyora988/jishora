# Jishora — Deploy on Railway (Full Guide)

This guide takes the Jishora platform from your PC to a live site on
**Railway**, using your domain **jishora.com**. Everything runs on Railway:
frontend, backend, and MySQL. No VPS, no manual SSL.

**Final layout**

| URL | Serves | Railway service |
|-----|--------|-----------------|
| `https://jishora.com` | Customer site + `/admin` panel | **frontend** (serve.js) |
| `https://api.jishora.com` | REST API + `/uploads` | **backend** (Express) |
| (internal) | Database | **MySQL** plugin |

> You can skip the custom domain at first and use the free `*.up.railway.app`
> URLs. The domain steps are Part 6.

---

## Part 0 — What you need (checklist)

- [x] GitHub account (`coinyora988`)
- [x] Domain `jishora.com` (Namecheap)
- [ ] A Railway account (sign up at railway.app with GitHub)
- [ ] Git installed on your PC (to push the code)

---

## Part 1 — Push the project to GitHub

Your project is already prepared: `.gitignore` protects secrets, the frontend
API URL is configurable, and `serve.js` respects Railway's port.

Open a terminal in the project root (`d:\Jishora`) and run:

```powershell
git init
git add .
git commit -m "Jishora platform - ready for Railway"
git branch -M main
```

Create a **new empty repository** on GitHub (e.g. `jishora`), then:

```powershell
git remote add origin https://github.com/coinyora988/jishora.git
git push -u origin main
```

> **Before pushing, double-check secrets are ignored.** Run `git status` and
> confirm `backend/.env`, `node_modules/`, and any `backup-*.sql` do **not**
> appear in the list of files to be committed. They are covered by `.gitignore`.

---

## Part 2 — Create the Railway project + MySQL

1. Go to **railway.app** → **New Project** → **Deploy from GitHub repo** →
   pick your `jishora` repo. (Authorize Railway to access the repo if asked.)
2. Railway may try to auto-deploy one service. That's fine — we'll configure it
   in Part 3/4.
3. In the project canvas click **+ New** → **Database** → **Add MySQL**.
   Railway provisions a MySQL instance and exposes these variables on it:
   `MYSQLHOST`, `MYSQLPORT`, `MYSQLDATABASE`, `MYSQLUSER`, `MYSQLPASSWORD`.

---

## Part 3 — Backend service

### 3a. Point the service at the `backend` folder
Open the service that was created from the repo (rename it to **backend**).
Go to **Settings**:
- **Root Directory:** `backend`
- **Start Command:** `npm start` (already set by `backend/railway.json`)

### 3b. Set the backend Variables
Open the **Variables** tab of the backend service and add these
(values for the DB come from the MySQL plugin — use Railway's reference syntax
`${{MySQL.MYSQLHOST}}` etc., or paste the raw values):

```
NODE_ENV=production
PORT=5000

DB_HOST=${{MySQL.MYSQLHOST}}
DB_PORT=${{MySQL.MYSQLPORT}}
DB_NAME=${{MySQL.MYSQLDATABASE}}
DB_USER=${{MySQL.MYSQLUSER}}
DB_PASSWORD=${{MySQL.MYSQLPASSWORD}}

FRONTEND_URL=https://jishora.com

JWT_SECRET=7622863430a9fa43cc4d92bc93fcb6fbdb7b0fd30fd6a34d082a7e29a625150696f5867c68b98e33dbb8f7a853023481
JWT_REFRESH_SECRET=4bd151f9a58c6dc68ee9b8e8a2f654d950ea868299694104f75af4a3940f52df0ce8fd1716aefbd325b177ed21b3ad14
JWT_EXPIRE=24h
JWT_REFRESH_EXPIRE=30d
SESSION_SECRET=60476bc5333c7d5d3b409a03d8137c15c6a884547e92afee856cc98aa98f7363

ADMIN_EMAIL=admin@jishora.com
BCRYPT_ROUNDS=10
```

> These secrets were generated for you. You can regenerate any with:
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
> A copy of this list lives in `backend/.env.production.example`.

> **If you don't use a custom domain yet:** set `FRONTEND_URL` to your
> frontend's `https://<name>.up.railway.app` URL (fill it in after Part 4).

### 3c. Generate a public domain for the backend
In the backend service → **Settings → Networking → Generate Domain**.
You'll get something like `https://jishora-backend-production.up.railway.app`.
Note it down — the frontend needs it.

### 3d. Persistent volume for uploads (IMPORTANT)
Deposit proof images and avatars are saved to `backend/uploads`. Railway's disk
is wiped on every redeploy, so attach a **Volume**:

- Backend service → **Settings → Volumes → New Volume**
- **Mount path:** `/app/backend/uploads`
  (Railway runs the service from `/app`; with root dir `backend`, uploads live
  at `/app/backend/uploads`. If files still reset, check the deploy logs for the
  actual working dir and adjust the mount path to match `<workdir>/uploads`.)

Without this, uploaded proof screenshots disappear on the next deploy.

---

## Part 4 — Frontend service

1. In the project → **+ New → GitHub Repo** → select the **same** repo again
   (this creates a second service). Rename it **frontend**.
2. **Settings:**
   - **Root Directory:** `/` (repo root — this is where `serve.js` and the root
     `package.json` live)
   - **Start Command:** `npm start` (runs `node serve.js`)
3. **Settings → Networking → Generate Domain** to get a public URL, e.g.
   `https://jishora-frontend-production.up.railway.app`.

### 4a. Tell the frontend where the backend is
The frontend must call the backend's URL. Open **`js/config.js`** in your repo
and set `PROD_API_BASE` to your backend URL **with `/api`** on the end:

```js
var PROD_API_BASE = 'https://api.jishora.com/api';
// (before the custom domain is set, use the backend's *.up.railway.app URL:)
// var PROD_API_BASE = 'https://jishora-backend-production.up.railway.app/api';
```

Commit and push — Railway auto-redeploys the frontend:

```powershell
git add js/config.js
git commit -m "Point frontend at production API"
git push
```

---

## Part 5 — Initialize the database (run once)

The backend needs the tables created and an admin user. Do this once after the
backend is deployed and connected to MySQL.

### 5a. Run the migrations
Open the **backend** service → the **⋮ menu / Command** (or use Railway CLI) and
run each migration against the production DB. The simplest reliable way is the
**Railway CLI** from your PC:

```powershell
# one-time: install & login
npm i -g @railway/cli
railway login
railway link         # pick your project, then the backend service

# run the migrations (they use the service's env vars / production DB)
railway run node migrations/001-fix-transactions-and-referrals.js
railway run node migrations/002-add-avatar-url.js
railway run node migrations/003-admin-panel-tables.js
railway run node migrations/004-homepage-stats.js
railway run node migrations/005-seed-products.js
railway run node migrations/006-task-permissions.js
railway run node migrations/007-min-priced-products.js
railway run node migrations/008-permission-batch.js
railway run node migrations/009-combo-plans.js
railway run node migrations/010-invite-codes.js
railway run node migrations/011-withdrawal-restriction.js
railway run node migrations/012-proxy-accounts.js
```

Run them in order (001 → 012). `005-seed-products.js` loads the markets and the
40 products.

### 5b. Create the admin user
Once the tables exist, create the admin by visiting the setup endpoint **once**:

```
https://api.jishora.com/api/setup/create-admin      (POST)
```

Easiest: open **`https://jishora.com/create-admin.html`** in your browser and
click the button — it calls the endpoint and shows the credentials. Default:

- **Email:** `admin@jishora.com`
- **Password:** `admin123`  ← change it immediately after first login

The endpoint only works while no admin exists (it locks itself afterward). To
set a custom password instead of the default, POST `{ "password": "YourStrongPass" }`.

> Log in at `https://jishora.com/admin/login.html`, then change the password
> from the admin panel (or via the Users page).

---

## Part 6 — Connect your domain jishora.com

### 6a. Add the domains in Railway
- **frontend** service → Settings → Networking → **Custom Domain** →
  enter `jishora.com` (and add `www.jishora.com` too if you want www to work).
  Railway shows you a **CNAME target** like `abcd1234.up.railway.app`.
- **backend** service → Settings → Networking → **Custom Domain** →
  enter `api.jishora.com`. Railway shows another CNAME target.

Keep both CNAME targets handy for the next step.

### 6b. Add the DNS records in Namecheap
Namecheap → **Domain List** → `jishora.com` → **Manage** → **Advanced DNS** →
**Add New Record** for each:

| Type | Host | Value (target from Railway) | TTL |
|------|------|-----------------------------|-----|
| CNAME | `api` | `<backend CNAME target>.up.railway.app` | Automatic |
| CNAME | `www` | `<frontend CNAME target>.up.railway.app` | Automatic |

For the **root** `jishora.com` (host `@`), CNAME often isn't allowed at the
apex. Two options:
- **Preferred:** Namecheap → use the **CNAME/ALIAS** for `@` if offered, pointing
  to the frontend target. Or
- Use Railway's provided approach: if Railway gives an **A record / IP** for the
  apex, add an **A Record** with Host `@` and that IP. Follow whatever Railway
  shows on the `jishora.com` custom-domain screen — it tells you exactly which
  record type to create.

Remove Namecheap's default "parking" CNAME/URL-redirect records if present, so
they don't conflict.

### 6c. Wait for DNS + SSL
DNS propagation takes a few minutes to a couple of hours. Railway automatically
issues a free SSL certificate once it detects the records. When done, both
`https://jishora.com` and `https://api.jishora.com` go live with the padlock.

### 6d. Final config check
Make sure these match your final domains, then redeploy if you change them:
- `js/config.js` → `PROD_API_BASE = 'https://api.jishora.com/api'`
- backend Variables → `FRONTEND_URL = https://jishora.com`

---

## Part 7 — Verify it works

1. Open `https://jishora.com` — the customer site loads over HTTPS.
2. Register a customer, log in.
3. Open `https://jishora.com/admin/login.html` — log in as admin.
4. Make a test deposit with a proof image; confirm it shows in the admin
   Deposits page (this also proves the uploads volume works).
5. **Redeploy the backend once** and re-check that the proof image still loads
   — this confirms the volume is persisting files.

---

## Notes & gotchas

- **CORS:** the backend only allows the origin in `FRONTEND_URL` (plus local
  dev). If the site can't reach the API, this is the first thing to check.
- **Real-time (SSE):** the admin live-updates stream (`/api/admin/events`) works
  over the normal HTTPS domain — no extra setup.
- **Costs:** Hobby ($5/mo) includes $5 of usage. Backend + MySQL + frontend all
  run 24/7, so watch the usage meter; upgrade to Pro only if you exceed it.
- **Changing code later:** just `git push` — Railway auto-redeploys the affected
  service.
- **Secrets:** never commit `backend/.env`. Production secrets live only in the
  Railway Variables tab.
- **Local development still works** exactly as before: `node backend/src/server.js`
  and `node serve.js`. `js/config.js` auto-detects localhost/LAN and uses `:5000`.
