# Laboe WA Lead OS - Supabase Version

This folder is ready for GitHub Pages hosting.

## Setup

1. Open Supabase Dashboard.
2. Go to SQL Editor.
3. Create a new query.
4. Paste the full contents of setup.sql.
5. Click Run.
6. Open index.html in a browser or push this folder to GitHub Pages.
7. Login with the Supabase Auth user you created.
8. Deploy the Supabase Edge Function in `supabase/functions/start-collection`.
9. Add the function secrets listed in `GITHUB_ACTIONS_SETUP.md`.
10. Open the dashboard, select a From / To date range, and click "Start Collection (100 leads)" for the To date.

## Collection flow

The GitHub Pages app writes a collection request into Supabase, then calls the Supabase Edge Function `start-collection`. That function securely triggers GitHub Actions without exposing a GitHub token in the browser. Each request collects 100 fresh leads, deduplicated against every lead already stored in Supabase (all dates) plus the contact registry, and writes them back as one new list. Requesting again on the same date appends another list with the numbering continued. The dashboard listens for realtime updates and only uses temporary polling while a collection is queued or processing.

Manual Run workflow in GitHub Actions is only for testing or urgent collection. Normal users should only click Start Collection in the dashboard.

## Supabase project

- URL: https://jzjuhrnedjbfpuvrqiwb.supabase.co
- Public browser key: sb_publishable_WLfAIGsnXIxBGr1aKokzSg_3-BQDu5g

Do not put a service_role or secret key in this static GitHub Pages app.
