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

## 3. Deploy Dashboard Trigger Function

This is the part that makes the dashboard button trigger GitHub Actions directly.

Create a fine-grained GitHub token for `LaboeStudio/wa-leads` with:

- Repository access: `LaboeStudio/wa-leads`
- Actions: Read and write
- Contents: Read-only

Then deploy the Supabase Edge Function in this repo:

```text
supabase/functions/start-collection/index.ts
```

Set these Supabase function secrets:

```text
GITHUB_TOKEN=your_github_fine_grained_token
GITHUB_OWNER=LaboeStudio
GITHUB_REPO=wa-leads
GITHUB_WORKFLOW_ID=laboe-collection-worker.yml
GITHUB_REF=main
```

Important: `GITHUB_TOKEN` belongs in Supabase Function secrets only. Do not put it in `index.html`.

## 4. Normal Dashboard Flow

1. Open the dashboard.
2. Select the `To` date you want to collect.
3. Click `Start Daily Collection`.
4. Dashboard saves the request in Supabase.
5. Dashboard calls the Supabase Edge Function.
6. The Edge Function triggers GitHub Actions immediately.
7. Worker marks the request as processing.
8. Worker collects leads and writes WA01-WA10 lists into Supabase.
9. The dashboard progress monitor updates, then Daily Lists shows the result.

## 5. Run Worker Manually

In GitHub:

1. Go to `Actions`.
2. Click `Laboe Collection Worker`.
3. Click `Run workflow`.
4. Optional: enter a `collection_date`, for example `2026-06-09`.
5. Click `Run workflow`.

Manual run is only for testing or urgent retry. Operators should normally use the dashboard button.

## Notes

The workflow still has this schedule as a fallback:

```yaml
cron: "*/5 * * * *"
```

GitHub Actions cron is not exact to the minute, so it can run a little late. You only need to click `Start Daily Collection` in the dashboard; manual `Run workflow` is for testing or urgent retry.
