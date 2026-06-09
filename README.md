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
8. Go to Collection and click "Seed WA01-2026-06-08 Test List" or import a daily Google Maps JSON file.

## Daily collection flow

The GitHub Pages app cannot run Google Maps collection by itself because it is a static browser app. Use Codex automation, a local collector, or GitHub Actions to generate a daily JSON file, then import it in the Collection tab. The importer splits up to 500 leads into WA01-WA10 automatically.

## Supabase project

- URL: https://jzjuhrnedjbfpuvrqiwb.supabase.co
- Public browser key: sb_publishable_WLfAIGsnXIxBGr1aKokzSg_3-BQDu5g

Do not put a service_role or secret key in this static GitHub Pages app.
