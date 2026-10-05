# Rental Watch

A Next.js + TypeScript rental-tracking MVP, backed by Supabase Auth/Postgres and a separate Node worker. Without credentials, the app shows a clearly labeled, one-time captured Riva Terra inventory snapshot, including the 726 sqft one-bedroom units. It does not pretend to refresh or have historical trends. The optional database seed in `lib/demo.ts` remains **synthetic** and separate from this observed preview.

## Quick start

1. Install Node 22 and pnpm 11. From this directory run `pnpm install --frozen-lockfile`.
2. Copy `.env.example` to `.env.local`. Without configuration, `pnpm dev` opens the captured-inventory preview at http://localhost:3000. Search by unit, floorplan or sqft (for example `726`). Its banner records the capture time; ongoing checks require the connected worker.
3. Create a Supabase project. In its SQL editor run `supabase/migrations/001_initial.sql` once. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local` from Project Settings → API. Use the anon JWT key; the worker uses the service-role JWT key.
4. Enable email/password sign-in under Authentication. Keep email confirmation enabled. Set Site URL to your web origin and add the development and deployed URLs to the redirect allowlist. Configure SMTP for production. Restart the web app after environment changes.
5. Create an account in the app, confirm its email, and sign in. Create a group and add an HTTPS rental URL.
6. Supply worker environment variables separately. `SUPABASE_SERVICE_ROLE_KEY` belongs **only in the worker and seed environment**, never in `NEXT_PUBLIC_*` or browser code. Add each approved public hostname to `INGESTION_ALLOWED_HOSTS`, including any required redirect/CDN/API hosts. Run `pnpm worker`. The worker does not automatically load `.env.local`; inject variables through the host's environment or run `node --env-file=.env.worker --import tsx worker/main.ts` locally.
7. After inspection, open Sources → Select options. Select several bedrooms, floorplans and/or unit numbers, refine size/rent/availability, and select daily or every-two-day tracking. Empty choices within a category mean all; selected categories combine with AND. Overlapping segments do not duplicate inventory in the dashboard.
8. Configure alert types, minimum drop and email in Alerts. In-app delivery works without an email vendor. For email, configure Resend, verify your sending domain, and set `RESEND_API_KEY`, `ALERT_FROM`, and `APP_URL` on the worker.

Optional database sample: after creating an account, run `pnpm seed <auth-user-uuid>` with Supabase URL and service-role key in your shell environment. It creates a labeled, paused sample group and 30 synthetic historical snapshots. The public demo works without seeding.

## Deploy behind your own website

**Cost-first default:** read [COSTS.md](COSTS.md). For a small personal pilot, use free web/database tiers and the included daily GitHub Actions worker instead of an always-on container. The container topology below is an upgrade path, not required for the free pilot.

Recommended topology:

```text
rentals.your-domain.com → Next.js web app (Vercel)
                              ↓ Supabase HTTPS APIs
                         Auth + Postgres with RLS
                              ↑
                   container worker (Render / Railway / Fly)
                              ↓
                   approved public rental websites
```

1. Put the `rental-tracker` directory in a private Git repository and connect it to Vercel. Select Next.js, use this directory as the root, and set the two public Supabase variables. Build with `pnpm build`.
2. Add `rentals.your-domain.com` in the hosting dashboard and copy its exact DNS instructions into your domain provider. Link to this subdomain from your main website. A subdomain avoids path-prefix, auth-redirect and asset issues. Do not iframe the authenticated app.
3. Run the migration in Supabase and configure the final auth Site URL/redirect URLs and SMTP.
4. Create an always-on private worker from this same repository. Build using `worker/Dockerfile` with the repository root as the Docker context. Set the worker environment variables from `.env.example`; no inbound web port is needed. Start with **one worker replica** (email outbox processing is serial; source jobs support concurrent claims).
5. Initially leave `ENABLE_BROWSER=false`. For reviewed dynamic sources, enable it in the Docker worker. The image installs Chromium. Playwright intercepts GET traffic and fulfills it through the same DNS-pinned, allowlisted public HTTPS fetcher. Add narrowly scoped dependencies to the hostname allowlist. Browser login sessions, CAPTCHA bypass, downloads, POSTs, private addresses and service workers are unsupported.
6. Set a restart policy and health/log alerts for the worker, Supabase error rates and failed email deliveries. Enable database backups and test restore. Choose appropriate Supabase compute/storage limits. Review retention before rolling out to many users.
7. Sign in as two different accounts and run the release checks below before inviting customers.

No deployment has been performed. Hosting, Supabase and email credentials are required to activate tracking. The Equity adapter was validated once against Riva Terra's public page on October 4, 2026 (17 identifiable units; the payload matched the displayed total). This is one format validation, not a guarantee of future or provider-wide coverage. The demo remains synthetic.

## Architecture and data model

- `groups`: user-owned named comparison collections.
- `properties`: physical property records shared across that user's source records. Explicitly link sources in the Add listing dialog; fuzzy address merging is deliberately avoided.
- `sources`: URL, adapter, current observation, last successful/attempted check, due time, error and fenced job lease. Separate sources are never summed as physical inventory. Unit keys are source-scoped; matching across providers needs explicit evidence.
- `segments`: persistent multi-select rules and 24/48-hour evaluation cadence. A source is fetched at the fastest enabled segment cadence, but slower segment change evaluation uses its own baseline.
- `snapshots`: every successful observation, including unchanged observations, its completeness, method, warnings, normalized units and weighted source aggregates. This preserves denominators for trends.
- `unit_history`: stable source unit identity, first/last seen, current disappearance, appearances and most recent attributes.
- `unit_spells`: separate observed availability periods. Open periods are censored at the last successful observation. Disappearance is observed between two checks and never treated as a confirmed rental.
- `events`: baseline-relative unit price changes, new identifiable units, removals, reappearance, segment inventory changes and entry into filter thresholds.
- `alert_rules`: per-segment event types, minimum dollar drop, enabled state and email preference.
- `notifications`: in-app inbox plus retryable email outbox. Event-to-notification uniqueness and provider idempotency keys prevent ordinary duplicate deliveries. Failed email retries back off, then stop after five attempts and remain visible in the app.

The migration enables row-level security and owner checks on parent relationships. Read-only ingestion tables are not writable by authenticated clients. All request endpoints validate the Supabase bearer token with `getUser`; request body validation uses Zod. Service-role secrets are isolated to the worker.

The worker claims jobs using `FOR UPDATE SKIP LOCKED`, leases and fencing tokens. `finish_source` commits the snapshot, lifetimes, events, outbox, next schedule and lease release in one transaction. Errors retain the last successful observation, increment failure count and back off to a maximum of 48 hours. An expired lease cannot commit. A failed or unreadable page is never persisted as zero inventory. Source errors remain visible.

## Source coverage: deliberately conservative

Arbitrary HTTPS URLs can be registered. **Arbitrary sites cannot be reliably scraped by one generic extractor.** Domain approval is required before a URL is fetched. This prevents an Internet-facing form from becoming a private-network fetch proxy and allows operator review of site access and rate limits.

`lib/extraction.ts` contains the adapter registry for Equity, Zillow, Apartments.com and generic property sites. Equity has a native `ea5.unitAvailability` JSON adapter, validated against Riva Terra's public page. It reads stable ledger/building/unit IDs, bedrooms, bathrooms, floorplans, floor, sqft, availability, amenities and the best displayed lease term's base monthly asking rent; completeness requires matching the visible inventory total. It parses JSON without executing site scripts. Invalid rows or unmatched totals become partial, and missing payloads become unsupported. **Zillow and Apartments.com inventories are not verified**; they use the conservative structured-data fallback and show this warning. Further site coverage needs an adapter and live validation.

The generic extractor recognizes JSON-LD apartments/accommodations with explicit monthly USD offers, and explicit semantic `data-rental-*` attributes. It skips unqualified prices, sale prices, nightly quotes and unclear currencies. It never invents floor, unit identity, lease term, square footage or available date. Missing values stay missing. Squares in meters are converted only with an explicit unit.

Only pages with an explicit completeness signal can be treated as full inventory. Generic JSON-LD is partial by default; it can emit positive observations/price changes but **not removal or inventory-change alerts**. Zero inventory requires an explicit complete inventory result. Unknown availability is not assumed to be available now when applying an availability-date filter.

### Add a verified site adapter

1. Capture permitted, representative fixtures: several units, zero availability, counts-only floorplans, price change, a unit returning, a challenge page, and missing attributes.
2. Implement a function returning `Extraction` and dispatch it in `extractWithAdapter` for the approved hostname. Parse the source's exact monthly lease quote, availability, source unit ID, count semantics and floor/size units. Do not use rent or array position as a unit identity.
3. Set `complete=true` only when all relevant inventory pages have been retrieved and the provider's empty state is unambiguous. Treat pagination, omitted inventory, parser drift and challenges as partial/error, never zero.
4. Keep unit identity stable across checks. A floorplan is a count-bearing record, not a synthetic unit. Preserve null/unknown metadata.
5. Add extraction regression fixtures and change-detection tests. Enable provider coverage only after live validation, a rate-limit review and release checks. Adapter revisions should not silently mix incompatible identities or quote bases.

Example semantic fixture:

```html
<main data-rental-inventory-complete="true">
  <div
    data-rental-unit
    data-unit-number="101"
    data-floorplan="Cove"
    data-bedrooms="1"
    data-bathrooms="1"
    data-sqft="730"
    data-floor="1"
    data-rent="3198"
    data-currency="USD"
    data-rent-period="monthly"
  ></div>
  <div
    data-rental-floorplan="Bay"
    data-floorplan="Bay"
    data-bedrooms="2"
    data-bathrooms="1"
    data-count="3"
    data-rent="4180"
    data-currency="USD"
    data-rent-period="monthly"
  ></div>
</main>
```

## APIs

Authenticated JSON requests use `Authorization: Bearer <Supabase access token>`.

- `POST /api/sources`: `{group_id, property_name, url, property_id?}`; creates a pending inspection (201). Group/property ownership is enforced. URLs require HTTPS without credentials/custom ports. Registration limit: 100 sources per account (MVP soft limit, not an atomic billing quota).
- `POST /api/segments`: `{source_id, name, rules, cadence_hours:24|48}`; requires a successful inspection and creates default in-app alerts.
- Groups and alert preferences use the Supabase client through RLS. Snapshot ingestion is worker-only via privileged PostgreSQL functions; there is no public unauthenticated ingestion endpoint.

## Analytics and limits

Dashboard aggregates count-bearing records with weights: count, minimum/mean/median rent and mean unit $/sqft. Trend charts recompute from snapshots against current segment selections. Inventory is observed per source; sources for the same building can disagree and must not be summed.

Floor/size comparisons use only identified units with known floor, sqft and rent, matched by observation day, bedrooms/bathrooms, lease term and either 100-sqft size band or floor. Premiums compare average $/sqft against the lowest floor/size band in the matched stratum. They are descriptive asking-price differences and are not causal: concessions, view and changing inventory can confound them. Days available uses each unit's observed availability spell; reappearance increments a source-scoped appearance count. Changing lease term creates a quote-basis event instead of a misleading price-drop alert. Historical lows apply to the loaded period. The UI loads up to 1,000 newest snapshots per selected source and time window; larger histories need pagination and aggregate materialization before claiming exhaustive analytics.

Operational gaps to resolve before a broad public launch: verified adapters for intended sources, account-level atomic quotas/rate limiting, telemetry, a production SMTP/provider test, database backups, retention policy, and load tests. The delivered app is a deployable MVP implementation, not a guarantee of unrestricted coverage or an already operated production service.

## Validation

`pnpm typecheck`, `pnpm test`, `pnpm build`.

Tests cover multi-select rule boundaries, missing metadata, weighted counts, zero inventory, source unit reappearance, price changes, threshold entry, aggregate-only identity, conservative JSON-LD normalization, unsafe URL rejection, Equity normalization/completeness, matched premiums and lease-basis changes. An isolated PostgreSQL engine test verifies migration syntax, RLS, parent ownership, write restrictions, fencing, partial versus complete lifetimes, availability spells and atomic event notifications. Run deployment acceptance against real Supabase as well; the engine test mocks the Supabase auth schema and uses core `gen_random_uuid` in place of the pgcrypto extension.

Production release acceptance:

- Two real users cannot access or reference one another's groups, properties, segments, snapshots or notifications. Attempt writes to ingestion-only tables with anon/authenticated keys; verify rejection.
- A failed/blocked check preserves current inventory and produces no disappearance or zero-count event.
- Complete fixtures transition 4 → 2 → 0 → 3 units, retaining unit history and opening a new availability spell on return. Partial fixtures never close spells.
- Daily and every-two-day segments evaluate on their own baselines; a crash/retry does not duplicate events or notifications.
- A real price drop delivers one in-app notification and one email; provider outage retries, and the visible error clears on recovery. Run one delivery worker replica.
- Validate actual provider pages and normalization before advertising supported sites. Check mobile, keyboard navigation and account confirmation/recovery on the deployed origin.

References: [Next.js authentication guidance](https://nextjs.org/docs/app/guides/authentication), [Supabase row-level security](https://supabase.com/docs/guides/database/postgres/row-level-security), [Supabase getUser](https://supabase.com/docs/reference/javascript/auth-getuser).
