# GitHub Actions Worker Setup

This repo contains the browser dashboard and the background collection worker.

## 1. Upload Files

Upload the full contents of this folder to the root of your GitHub repo:

- `index.html`
- `README.md`
- `setup.sql`
- `data/contact_registry.json`
- `scripts/laboe_collection_worker.mjs`
- `scripts/laboe_collect_google_maps_leads.mjs`
- `.github/workflows/laboe-collection-worker.yml`

## 2. Add GitHub Secrets

In GitHub:

1. Open the repo.
2. Go to `Settings`.
3. Go to `Secrets and variables`.
4. Go to `Actions`.
5. Click `New repository secret`.

Create these secrets:

```text
SUPABASE_URL
```

Value:

```text
https://jzjuhrnedjbfpuvrqiwb.supabase.co
```

Create another secret:

```text
SUPABASE_SERVICE_ROLE_KEY
```

Value: copy this from Supabase `Project Settings > API Keys > Secret keys`.

Important: never put the service role key in `index.html`, GitHub Pages, or chat screenshots.

## 3. Run Worker Manually

In GitHub:

1. Go to `Actions`.
2. Click `Laboe Collection Worker`.
3. Click `Run workflow`.
4. Optional: enter a `collection_date`, for example `2026-06-09`.
5. Click `Run workflow`.

## 4. Dashboard Flow

1. Open the dashboard.
2. Select the `To` date you want to collect.
3. Click `Start Daily Collection`.
4. GitHub Actions picks up the Supabase request on its schedule.
5. Worker marks the request as processing.
6. Worker collects leads and writes WA01-WA10 lists into Supabase.
7. The dashboard progress monitor updates, then Daily Lists shows the result.

## Notes

The workflow currently runs on this schedule:

```yaml
cron: "*/5 * * * *"
```

GitHub Actions cron is not exact to the minute, so it can run a little late. You only need to click `Start Daily Collection` in the dashboard; manual `Run workflow` is for testing or urgent retry.
