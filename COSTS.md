# Start at $0/month

For a small **personal/non-commercial pilot**, start with Supabase Free + Vercel Hobby + a private GitHub repository running the included daily Actions workflow. Keep browser extraction disabled and use in-app notifications. No AI API or paid scraping proxy is required by this app. These free tiers do not imply unlimited scale or an uptime guarantee.

Current published limits (checked October 4, 2026):

| Service                                        | Free allowance                                            | Important boundary                                                                                                                                                           |
| ---------------------------------------------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Supabase                                       | 500 MB database, 50,000 monthly active users, 5 GB egress | Low-activity projects can pause after 7 days; monitor database/history growth.                                                                                               |
| Vercel Hobby                                   | Personal/non-commercial web hosting within plan quotas    | Commercial use requires another plan/provider.                                                                                                                               |
| GitHub Actions, private GitHub Free repository | 2,000 runner minutes/month                                | Shared with your other workflows. A daily 15-minute maximum is at most about 465 minutes/month, excluding other workflows. Scheduling is best effort, not an exact-time SLA. |
| Resend, optional                               | 3,000 emails/month, 100/day                               | Verified sending domain and production auth SMTP are separate setup concerns. Start with in-app alerts if you want fewer dependencies.                                       |

## Configure the free scheduled worker

1. Make this directory the root of a private GitHub repository. The included `.github/workflows/check-rentals.yml` runs at 16:17 UTC daily and supports manual dispatch. This is approximately 9:17 a.m. Pacific in daylight time / 8:17 a.m. in standard time. GitHub may delay runs. Every-two-day rules are handled by database scheduling; you do not need another workflow.
2. Under repository Settings → Secrets and variables → Actions, add secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and optionally `RESEND_API_KEY`. Add variables `INGESTION_ALLOWED_HOSTS`, `APP_URL`, and optional `ALERT_FROM`. Secrets must never be committed. Enable Actions and run the workflow manually for the first inspection.
3. Keep `ENABLE_BROWSER=false`. The worker drains due jobs for a ten-minute work budget; the workflow has a fifteen-minute hard timeout. Large queues need more frequent runs or a paid worker. A new source may wait until the next daily run unless you dispatch it manually.
4. Set GitHub Actions budgets to block usage beyond your allowance, rather than merely notify. The app does not create paid hosting resources. Stay on free provider plans and review their billing pages before upgrading.
5. Start with 10–20 source URLs. Measure actual database growth and job duration before increasing. The public web source limit is 100/account, but that is a software limit, not a free-tier capacity guarantee.

Do **not** deploy the always-on Docker worker at the same time unless you intentionally want to pay for continuous service. The container remains an option for later growth and validated dynamic adapters.

The likely future cost driver is extraction: dynamic sites, large numbers of pages, or provider-specific access services. This MVP makes restrictions visible rather than buying proxies or bypassing challenges. Your existing website/domain can link to the app; using an existing subdomain avoids buying another domain. A new domain, paid commercial hosting, paid SMTP, extra database capacity, and backups can cost extra.

Before a commercial launch, choose commercial-compatible hosting and reassess database backups, monitoring, email and worker reliability. For current base paid prices, consult the providers rather than treating this pilot's $0 target as a guarantee.

Sources: [Supabase pricing](https://supabase.com/pricing), [Supabase pausing](https://supabase.com/docs/guides/platform/free-project-pausing), [Vercel Hobby restrictions](https://vercel.com/docs/plans/hobby), [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Resend free tier](https://resend.com/blog/new-free-tier).
