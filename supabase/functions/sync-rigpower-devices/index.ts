import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

type AnyRow = Record<string, unknown>;

const pick = (row: AnyRow, keys: string[]): unknown => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null && row[k] !== '') return row[k];
  }
  return null;
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};

const toStr = (v: unknown): string | null =>
  v === null || v === undefined ? null : String(v);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  // Authentication is MANDATORY: this endpoint runs with the service role.
  // If the secret is not configured, refuse every request (fail closed).
  const triggerSecret = Deno.env.get('SYNC_TRIGGER_SECRET');
  if (!triggerSecret) {
    return json(
      { ok: false, error: 'Server misconfigured: SYNC_TRIGGER_SECRET is not set.' },
      500,
    );
  }
  if (req.headers.get('x-sync-secret') !== triggerSecret) {
    return json({ ok: false, error: 'Unauthorized' }, 401);
  }


  const rigUrl = Deno.env.get('RIGPOWER_SUPABASE_URL');
  const rigKey = Deno.env.get('RIGPOWER_ANON_KEY');
  const rigTable = Deno.env.get('RIGPOWER_DEVICES_TABLE') ?? 'devices';

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const recordState = async (
    status: string,
    rows: number,
    error: string | null,
  ) => {
    await supabase.from('sync_state').upsert(
      {
        job: 'rigpower-devices',
        last_run_at: new Date().toISOString(),
        status,
        rows_synced: rows,
        error,
      },
      { onConflict: 'job' },
    );
  };

  const missing: string[] = [];
  if (!rigUrl) missing.push('RIGPOWER_SUPABASE_URL');
  if (!rigKey) missing.push('RIGPOWER_ANON_KEY');
  if (missing.length) {
    const error = `Missing configuration: ${missing.join(', ')}`;
    await recordState('error', 0, error);
    return json({ ok: false, error }, 400);
  }

  try {
    const base = rigUrl!.replace(/\/+$/, '');
    const pageSize = 1000;
    let offset = 0;
    const remote: AnyRow[] = [];

    while (true) {
      const res = await fetch(
        `${base}/rest/v1/${encodeURIComponent(rigTable)}?select=*`,
        {
          headers: {
            apikey: rigKey!,
            Authorization: `Bearer ${rigKey}`,
            Range: `${offset}-${offset + pageSize - 1}`,
            'Range-Unit': 'items',
          },
        },
      );

      if (!res.ok) {
        const text = await res.text();
        throw new Error(
          `RigPower REST error ${res.status}: ${text.slice(0, 300)}`,
        );
      }

      const page = (await res.json()) as AnyRow[];
      remote.push(...page);
      if (page.length < pageSize) break;
      offset += pageSize;
      if (offset > 50_000) break;
    }

    const now = new Date().toISOString();
    const seen = new Set<string>();
    const rows = remote
      .map((r) => {
        const sourceId = toStr(pick(r, ['id', 'device_id', 'uuid', 'slug']));
        const name = toStr(pick(r, ['name', 'model', 'device_name', 'title']));
        if (!sourceId || !name) return null;

        const voltage = toNum(pick(r, ['voltage', 'volts', 'v', 'power_voltage']));

        // RigPower stores current in milliamps (current_ma).
        const currentA = toNum(pick(r, ['current', 'amps', 'a', 'current_a']));
        const currentMa = toNum(pick(r, ['current_ma', 'currentMa', 'ma']));
        const current = currentA ?? (currentMa !== null ? currentMa / 1000 : null);

        const power =
          toNum(pick(r, ['power', 'watts', 'power_w'])) ??
          (voltage !== null && current !== null
            ? Math.round(voltage * current * 1000) / 1000
            : null);

        const fallbackObs = [
          toStr(pick(r, ['category'])),
          toStr(pick(r, ['power_interface'])),
          r.verified === true ? 'verified' : null,
        ]
          .filter(Boolean)
          .join(' · ');

        const observations =
          toStr(pick(r, ['observations', 'notes', 'note', 'comments'])) ??
          (fallbackObs.length > 0 ? fallbackObs : null);

        return {
          source_id: sourceId,
          name,
          manufacturer: toStr(
            pick(r, ['manufacturer', 'brand', 'maker', 'vendor']),
          ),
          voltage,
          current,
          polarity: toStr(pick(r, ['polarity', 'power_polarity'])),
          power,
          connector: toStr(
            pick(r, ['connector', 'plug', 'connector_name', 'connector_type']),
          ),
          connector_type: toStr(
            pick(r, ['connector_type', 'plug_type', 'connectorType']),
          ),
          observations,
          last_synced_at: now,
        };
      })

      .filter((r): r is NonNullable<typeof r> => r !== null)
      .filter((r) => {
        if (seen.has(r.source_id)) return false;
        seen.add(r.source_id);
        return true;
      });

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabase
        .from('devices')
        .upsert(chunk, { onConflict: 'source_id' });
      if (error) throw new Error(`Upsert failed: ${error.message}`);
    }

    await recordState('success', rows.length, null);
    return json({ ok: true, rows: rows.length, last_synced_at: now });
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await recordState('error', 0, error);
    return json({ ok: false, error }, 500);
  }
});
