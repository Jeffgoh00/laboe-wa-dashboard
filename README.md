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
8. Open the dashboard, select a Run Date, and click "Start Daily Collection".

## Daily collection flow

The GitHub Pages app writes a collection request into Supabase. GitHub Actions checks for requested runs on schedule, collects the leads, and writes WA01-WA10 lists back into Supabase. The dashboard listens for updates and also refreshes every 30 seconds.

Manual Run workflow in GitHub Actions is only for testing or urgent collection. Normal users should only click Start Daily Collection in the dashboard.

## Supabase project

- URL: https://jzjuhrnedjbfpuvrqiwb.supabase.co
- Public browser key: sb_publishable_WLfAIGsnXIxBGr1aKokzSg_3-BQDu5g

Do not put a service_role or secret key in this static GitHub Pages app.
