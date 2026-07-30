# RigPower → Stepcord device sync

Most of this is already in place from the previous round. Below is the confirmed design plus the two remaining pieces.

## Table schema (already created in Stepcord's backend)

Table `devices`:
- `source_id` (text, unique) — device id in RigPower, dedup key
- `name`, `manufacturer`
- `voltage`, `current`, `power` (numeric)
- `polarity`, `connector`, `connector_type`, `observations` (text)
- `last_synced_at`, `created_at`, `updated_at`

Access: public read-only. Writes only by the sync function (service role). Stepcord never edits RigPower-owned data.

Table `sync_state`: job name, `last_run_at`, `status`, `rows_synced`, `error` — powers the "last synced" label.

## Edge function (already created)

`sync-rigpower-devices`:
- Reads `RIGPOWER_SUPABASE_URL` + `RIGPOWER_ANON_KEY` from secrets (configurable, nothing hardcoded)
- GETs the RigPower REST endpoint with pagination
- Maps fields and upserts into `devices` on `source_id`
- Writes the run result into `sync_state`

## UI (already created)

- Settings → "Device Sync" card: "Sync now" button, last-sync timestamp, row count, error display
- Device selector: "Synced from RigPower" section with name/manufacturer search, feeding the existing voltage/current auto-config logic

## Remaining work

1. **You configure on the RigPower side**: enable public/anon SELECT on its devices table, then give me (or add in Project Settings → Secrets) `RIGPOWER_SUPABASE_URL` and `RIGPOWER_ANON_KEY`. Until then "Sync now" returns a config error.
2. **Daily cron**: schedule `sync-rigpower-devices` once a day via pg_cron + pg_net. I'll add this after the secrets exist so the first scheduled run succeeds.
3. Verify a real sync end-to-end and confirm the field mapping matches RigPower's actual column names (I'll adjust the mapping if they differ).
