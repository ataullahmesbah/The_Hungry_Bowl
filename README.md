# The Hungry Bowl

A complete **Restaurant Digital Operations & Management Platform** — public
website, reservations, floor plan, orders, kitchen display, payments,
inventory, purchasing, recipes/food-cost, finance and reporting — built so a
**non-developer runs the whole thing from the dashboard**, without ever
touching code.

> Bangla: এই সিস্টেমের সব কিছু (মেনু, দাম, ওয়েবসাইটের লেখা, ছবি, কারেন্সি,
> ট্যাক্স, স্টাফ, রোল/পারমিশন, SEO) ড্যাশবোর্ড থেকে বদলানো যায় — কোডে হাত
> দিতে হবে না।

- **Setup & commands →** [`SETUP_BANGLA.md`](./SETUP_BANGLA.md) (বাংলা + English, step by step)
- **Deployment (Vercel / VPS / Docker) →** [`DEPLOYMENT.md`](./DEPLOYMENT.md)
- **Environment variables →** [`.env.example`](./.env.example)
- **Security model & audit →** [`SECURITY.md`](./SECURITY.md)
- **For your audit team →** [`AUDIT_GUIDE.md`](./AUDIT_GUIDE.md)

---

## 1. What it does

| Area | What's in it |
|---|---|
| **Public website** | Home with editable sections, menu with categories/variants/add-ons, offers, events, gallery, reviews, contact, custom CMS pages, online reservation form |
| **Reservations** | Public booking → staff confirm/reject/assign, guest count, time slots, no-show handling |
| **Floor plan & table sessions** | Areas, tables (add/edit/retire), live status, **one table → many independent bills** (see §3) |
| **Orders** | Dine-in / takeaway / delivery, server-side pricing, line edits, discounts with permission, per-order secret code |
| **Kitchen Display (KDS)** | Live ticket queue, accept → preparing → ready, per-station filtering |
| **Payments & billing** | Split/partial payments, multiple methods (Cash, Card, bKash, Nagad, Rocket, Upay, Bank), refunds, voids, printable receipts |
| **Inventory** | Warehouses + kitchen store, append-only stock ledger, transfers, adjustments, wastage, returns, moving-average costing, **daily stock ledger per store** |
| **Purchasing** | Suppliers, purchase orders, partial receiving, supplier dues |
| **Recipes / BOM** | Per-item recipe, automatic stock consumption on order completion, live food-cost and margin |
| **Finance** | Expense categories, expense entry, **daily reconciliation** (sales vs. collected, variance reported not hidden), day closing |
| **Reports & analytics** | Sales by day/hour, best sellers, payment-method breakdown, inventory valuation, profit view, **sales per staff member** |
| **Users & RBAC** | 10 seeded roles, 58 granular permissions, custom roles, per-user overrides |
| **Audit log** | Append-only record of every sensitive action, with severity |
| **SEO** | Per-page title/description/OG image, sitemap, robots, JSON-LD structured data, analytics IDs |

## 2. Built to be sold to clients in any country

The restaurant is in **Bangladesh**, but nothing about Bangladesh is hard-coded.
Everything below lives in **Settings → Restaurant**, in the database:

- country, currency code, currency symbol, symbol position, decimal places
- locale and **timezone** (the "business date" for reports and order numbers is
  computed in the restaurant's own timezone, not the server's)
- phone country code, address format, tax percent and tax label

Payment methods are **database rows, not code enums** — bKash/Nagad/Rocket are
tagged `countryCode: "BD"`. A client in another country disables them and adds
their own from **Payments → Methods**, no deployment needed.

> Bangla: বাংলাদেশের বাইরে কোনো ক্লায়েন্টের কাছে বিক্রি করলে শুধু Settings
> থেকে country, currency, timezone, tax বদলে দিলেই হবে — কোড বদলাতে হবে না।

## 3. One table, many orders — the billing fix

A table is **not** a billing unit. A **TableSession** is.

```
Table T05
 ├── Session HB-S-1042  (party A, 7:10pm)  → order #1031, #1034  → Bill A
 └── Session HB-S-1058  (party B, 9:05pm)  → order #1052        → Bill B
```

When a party sits down, a session opens. Every round they order — first course,
second round, drinks after — attaches to **that** session and settles into
**one** bill. When they leave, the session closes. The next party opens a
**new** session with a new code and a **completely separate** bill.

Enforced by the system:

- Seating a second party at a table with an open session is **refused**.
- Closing a session is **refused** while any of its orders is unpaid or still in
  the kitchen. A manager may override — that override is audited at **HIGH**
  severity and pushes a **CRITICAL** notification to finance.
- Every session is kept in the table's history, so both bills stay separately
  auditable forever.

> Bangla: এক টেবিলে একাধিক অর্ডার আসতে পারে — এক পার্টির সব অর্ডার একটাই বিলে
> যায়। পার্টি চলে গেলে সেশন বন্ধ, নতুন কাস্টমার বসলে নতুন সেশন ও **আলাদা বিল**।

## 4. Technology

| | |
|---|---|
| Framework | Next.js 15 (App Router, React 19, Server Components) |
| Language | TypeScript 5.7, `strict` |
| Styling | Tailwind CSS 4 |
| Database | PostgreSQL + Prisma 6 |
| Auth | Opaque server-side sessions (revocable), bcrypt hashes |
| Media | Cloudinary, signed **direct browser upload** (no serverless body limit) |
| Realtime | Database-backed event bus with a driver abstraction: `poll` (works on Vercel) or `sse` (long-running server) |
| Money | `Prisma.Decimal` end-to-end — no float arithmetic on money |

## 5. Quick start

```bash
npm install
cp .env.example .env          # fill in DATABASE_URL, DIRECT_URL, AUTH_SECRET
npm run db:deploy             # create the tables
npm run db:seed               # roles, permissions, settings, owner account
npm run dev                   # http://localhost:3000
```



## 6. Project layout

```
prisma/
  schema.prisma          all models for every module
  seed.ts                roles, permissions, settings, units, payment methods
src/
  app/
    (public)/            customer-facing website
    dashboard/           staff dashboard (54 pages)
    kds/                 kitchen display
    api/                 86 route handlers, all through the guarded wrapper
  components/            UI, dashboard widgets, charts, forms
  lib/
    api.ts               the route() wrapper: origin check, rate limit,
                         permission, zod validation, uniform errors, no-store
    auth/                sessions, guards
    rbac/                permission catalogue + role definitions
    service/             business logic (orders, inventory, consumption,
                         reconciliation) — the only writers of ledgers
    security/            password rules, rate limit, HTML sanitiser
  middleware.ts          security headers + CSP
```

## 7. Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | `prisma generate` + production build |
| `npm start` | Run the production build |
| `npm run typecheck` | TypeScript, no emit |
| `npm run db:deploy` | Apply migrations (production-safe) |
| `npm run db:migrate` | Create a new migration (development) |
| `npm run db:seed` | Seed roles, permissions, settings, owner |
| `npm run setup` | `db:deploy` + `db:seed` in one go |
| `npm run db:studio` | Prisma Studio, to inspect data |
# The_Hungry_Bowl
