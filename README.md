# Laboe WA Lead OS - Campaign Version

This folder is ready for GitHub Pages hosting.

## Setup

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Create a new query.
4. Paste the full contents of setup.sql.
5. Click Run.
6. Run `migrations/01_merchants_and_search.sql` through `migrations/16_campaigns.sql` in order.
7. Open index.html in a browser or push this folder to GitHub Pages.
8. Login with the Supabase Auth user you created.
9. Deploy the Supabase Edge Function in `supabase/functions/start-collection`.
10. Add the function secrets listed in `GITHUB_ACTIONS_SETUP.md`.
11. Open the dashboard, select a Campaign and date range, then click Start Collection.

## Campaigns

The dashboard currently includes:

- `design` — Laboe Design Services
- `florist` — Laboe Florist Leads (florists/flower shops only, all Malaysia)

Retired: `joymom` (Joymom Mooncake B2B) — archived 2026-07-02; historical
joymom leads remain in the database but the campaign can no longer run.

Use the Campaign selector in the left sidebar to switch. Leads, daily lists,
collection runs, messages, statuses, and 90-day deduplication are isolated by
campaign. Existing records are migrated to `design`.

For an existing Supabase project, run `migrations/16_campaigns.sql`, then
redeploy the `start-collection` Edge Function, GitHub Actions workflow,
dashboard, and worker files.

## Collection flow

The GitHub Pages app writes a collection request into Supabase, then calls the
Supabase Edge Function `start-collection`. That function securely triggers
GitHub Actions without exposing a GitHub token in the browser. Each request
collects 100 fresh leads and deduplicates against leads from the same campaign
during the previous 90 days. The Design campaign also checks the existing
contact registry. Requesting again on the same date appends another list with
the numbering continued inside that campaign.

Manual Run workflow in GitHub Actions is only for testing or urgent collection. Normal users should only click Start Collection in the dashboard.

## Supabase project

- URL: https://jzjuhrnedjbfpuvrqiwb.supabase.co
- Public browser key: sb_publishable_WLfAIGsnXIxBGr1aKokzSg_3-BQDu5g

Do not put a service_role or secret key in this static GitHub Pages app.
