# Security model

Your requirement was blunt and correct: *"api secure, database security, data
security — কেউ চাইলেই যেন API data না দেখতে পারে."* This document says exactly
how that is enforced, and records the audit that was run over the finished code.

---

## 1. Nothing is public unless it says so

Every one of the **86** API routes goes through one wrapper, `src/lib/api.ts`:

```ts
if (options.permission)      session = await requirePermission(options.permission);
else if (!options.public)    session = await requireSession();
```

The default is **deny**. A handler with no options at all still requires a
signed-in user; only an explicit `public: true` opens it. There is no way to add
a route that is accidentally open — forgetting to configure it makes it *more*
restricted, not less.

The wrapper also applies, in order, before your handler ever runs:

| Step | What it does |
|---|---|
| Origin check | Mutations from a foreign origin get `403 bad_origin` (CSRF defence, on top of the `SameSite=Lax` cookie) |
| Rate limit | Database-backed fixed window, per IP per bucket |
| Authn / authz | `requireSession()` or `requirePermission()` |
| Validation | zod schema for body and query — unknown/extra fields never reach the handler |
| Errors | Uniform `{ ok:false, error:{ code, message } }`; internal errors never leak a stack trace or a Prisma message |
| Caching | `Cache-Control: no-store, private` on every authenticated response |

**The only three public endpoints**, all deliberate and all rate-limited:

| Route | Limit | Why it's public |
|---|---|---|
| `POST /api/auth/login` | 8 / 5 min | You cannot log in from inside a session |
| `POST /api/public/reservations` | 5 / hour | The booking form on the website |
| `POST /api/public/reviews` | 3 / hour | The review form; submissions are unpublished until moderated |

Public **page** data (menu, offers, gallery, pages) is read in Server Components
on the server — it is never exposed as a browsable JSON API.

## 2. Permissions, not roles, guard the data

58 permissions across 19 modules. Roles are just named bundles of them, with a
`rank` (lower = more powerful) so nobody can edit or out-rank an account above
themselves. 10 roles are seeded (Super Admin → Kitchen Staff); the owner can
create more and re-mix permissions **from the dashboard**.

Consequences that fall out of this design:

- A kitchen tablet signed into a Kitchen Staff account can call the KDS
  endpoints and nothing else. Sales figures, costs and payroll return `403`.
- Realtime events carry a `requiredPermission`; the stream **filters per
  subscriber**, so an event a user may not see is never written to their
  connection — not hidden in the UI, actually never sent.
- Discounts, refunds, voids, session-close overrides and role changes each need
  their own permission and each write an audit row.

## 3. Sessions

- **Opaque, server-side, revocable.** The cookie is `<sessionId>.<secret>`; only
  a SHA-256 of the secret is stored. A stolen database row cannot be replayed as
  a cookie, and a stolen cookie can be killed instantly server-side — which a
  self-contained JWT cannot be.
- Cookie flags: `httpOnly`, `sameSite=Lax`, `secure` in production, `path=/`.
- Comparison is constant-time.
- Changing a password revokes **every other** session for that account.
- Sessions expire after `SESSION_MAX_AGE_DAYS` (default 7).

Passwords: bcrypt, cost **12**, minimum length and complexity enforced by
`passwordSchema`, plus a common-password blocklist. `passwordHash` is never
included in any response shape anywhere in the codebase — it is only read inside
the login and change-password handlers for comparison.

## 4. Database

- **Prisma everywhere; no raw SQL.** `$queryRawUnsafe` and `$executeRawUnsafe`
  appear nowhere in the project, so string-built SQL cannot exist.
- **Money is `Decimal`**, never float — no rounding drift in bills or reports.
- **Prices are computed on the server** inside the transaction, read from the
  database. A client that posts its own price is ignored, not trusted.
- **Ledgers are append-only.** `StockMovement` and `AuditLog` are only ever
  inserted; balances are derived. There is no `PATCH` or `DELETE` route for the
  audit log — not "an admin shouldn't", there is no code path.
- Order numbers come from an atomic per-business-date counter, so two
  simultaneous orders cannot collide.
- Each order carries a short **secret code**, so a receipt lookup needs the code
  and not just a guessable sequential number.

## 5. Input and output

- Every body and query is zod-validated at the boundary.
- CMS/rich text goes through a hand-written **allow-list** sanitiser
  (`src/lib/security/sanitize.ts`) — on write **and** again on render, so
  content stored before a rule changed is still safe when displayed.
- Exactly two `dangerouslySetInnerHTML` uses exist, both accounted for:
  sanitised CMS content, and self-authored JSON-LD with `<` escaped.
- Uploads are **signed, direct-to-Cloudinary**: the API secret stays on the
  server, the browser never sees it, and no file passes through the app.

## 6. Transport and headers

`src/middleware.ts` sets, on every response: a full **Content-Security-Policy**
(`object-src 'none'`, `base-uri 'self'`, `form-action 'self'`,
`frame-ancestors 'self'`), `X-Content-Type-Options: nosniff`,
`X-Frame-Options: SAMEORIGIN`, `Referrer-Policy: strict-origin-when-cross-origin`,
a restrictive `Permissions-Policy`, and **HSTS** with preload in production.
`/dashboard` and `/kds` additionally get `no-store` and, via `vercel.json`,
`X-Robots-Tag: noindex`.

`poweredByHeader` is off, so the stack is not advertised.

## 7. Audit trail

Every sensitive action writes an `AuditLog` row: actor, action, entity, entity
id, severity, IP and before/after where it matters. Severity is used, not
decorative — a manager overriding a table-session close to force it shut is
logged **HIGH** and pushes a **CRITICAL** notification to finance, because that
is the one action that can hide an unpaid bill.

---

## 8. Audit performed on the finished code

Run across all 86 routes and the full `src/` tree.

| Check | Result |
|---|---|
| Routes reachable without authentication | **3** — login, public reservation, public review. All intended, all rate-limited. |
| Routes missing a permission but requiring a session | 6 — `auth/me`, `auth/logout`, `auth/change-password`, `notifications` (GET/PATCH), `realtime/events`, `realtime/stream`. Correct by design: the account endpoints act on the caller alone, `notifications` scopes every query to `session.user.id`, and the two realtime routes filter each event against the caller's permission set. |
| Raw SQL (`$queryRawUnsafe` / `$executeRawUnsafe`) | None. |
| `passwordHash` reachable in a response | None. |
| `dangerouslySetInnerHTML` | 2, both sanitised or self-authored. |
| Secrets bundled to the browser | None. Only `NEXT_PUBLIC_APP_URL` and `NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME`, neither secret. |
| Mutations without an origin check | None. |
| Authenticated responses cacheable | None — `no-store, private` is set by the wrapper. |
| Audit log mutable through the API | No route exists. |

### Bugs found by testing and fixed

Two real defects were found by exercising the running system, not by reading it:

1. **Overpayment guard was inverted for settled orders.**
   `if (amount > due + 0.5 && due > 0)` meant an order with `due = 0` accepted
   unlimited further payments — cash could be recorded against a paid bill
   forever. Now a settled order refuses with `already_paid`, and any amount over
   the outstanding balance refuses with `overpayment`. Verified: partial
   accepted → overpayment refused → remainder accepted → next payment refused.

2. **Moving-average cost was computed after the stock movement.**
   `updateAverageCost()` ran *after* `applyMovement()`, so the incoming quantity
   was counted on both sides of the average — a 200/kg delivery into an empty
   store recorded as 100/kg, understating food cost on every dish using it.
   Fixed at all four call sites and the ordering requirement is now documented in
   the helper itself. Verified across three deliveries: 200 → 250 → 175.

A third, smaller issue: cancelled orders kept a non-zero `dueAmount` and drifted
into outstanding-balance reports. Now zeroed on cancellation.

Notably, the daily reconciliation screen independently surfaced the bad data
left behind by bug #1 before the fix was deployed — which is exactly the job it
exists to do: it computes sales and collections separately and **reports the
variance rather than absorbing it**.

---

## 9. What the operator still has to do

Security that code cannot enforce for you:

- Change the seed owner password on first login, then delete `SEED_OWNER_*`
  from the environment.
- Give each staff member their **own** account. Shared logins destroy the audit
  trail's value.
- Keep `RATE_LIMIT_ENABLED=true`.
- Serve over HTTPS only (HSTS is already sent in production).
- Restrict database network access to the app host; never expose Postgres to
  the internet.
- Back up the database, and test a restore. See `DEPLOYMENT.md` §5.
- Rotate `AUTH_SECRET` if you suspect exposure — it signs out every user, which
  is the point.
