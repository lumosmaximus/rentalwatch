# Validation record

Validated locally on October 4, 2026. Demo values remain synthetic.

- Next.js production build and strict TypeScript checks pass.
- All 16 automated tests pass. Desktop and 390px mobile views were reviewed. Multi-select tracking was saved in the demo and showed both bedroom choices with a two-day cadence. Source failures remain visible and unavailable controls are disabled.
- Unit tests exercise rules, aggregation, source identities, event detection, quote-basis changes, parsing, completeness, and source URL safety.
- A PostgreSQL engine test runs the migration (using its built-in UUID function in place of pgcrypto) and checks account isolation, parent ownership, ingestion write restrictions, leases, partial checks, disappearance, return, availability spells, and alert creation in the completion transaction.
- The public [Riva Terra Equity page](https://www.equityapartments.com/san-francisco-bay/redwood-city/riva-terra-apartments-at-redwood-shores) was retrieved through the app's DNS-pinned public HTTPS fetcher. `equity-ea5-v1` normalized 17 identifiable units; the count matched the page's displayed total. Best displayed lease term, unit identity, sqft, floor, bedrooms/bathrooms, amenities and availability dates were present. This validates that page format at one point in time; it is not a guarantee of every Equity property or future availability.
- Zillow and Apartments.com provider inventory adapters are not live-validated. They retain structured-data fallback and explicit unsupported/blocked/partial statuses.
- No user Supabase project, hosted deployment, real account confirmation/recovery, or email delivery has been connected or verified. Run the README release checks after connecting them.
- Browser extraction is optional and disabled in the free daily workflow. Live extraction did not require it. Review/test that path before enabling it for specific sources.

The raw source page used for inspection is excluded from version control in `.local/`. The regression fixtures are small synthetic payloads, not copies of the provider's full page.
