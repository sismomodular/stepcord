// Public read-only telemetry endpoint for RP2040 / microcontroller polling.
// GET /functions/v1/monitor?table=<name>
// Returns a flat JSON object (<256 bytes) with numeric/boolean values + unix ts.

import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

// Whitelist of tables exposed to the microcontroller.
// Only numeric/boolean columns are emitted; strings/objects are dropped.
const ALLOWED_TABLES: Record<string, string> = {
  monitor: "monitor",
};
const DEFAULT_TABLE = "monitor";

function flatten(row: Record<string, unknown>): Record<string, number | boolean> {
  const out: Record<string, number | boolean> = {};
  for (const [k, v] of Object.entries(row)) {
    if (typeof v === "number" && Number.isFinite(v)) {
      // round to 3 decimals to keep payload small
      out[k] = Math.round(v * 1000) / 1000;
    } else if (typeof v === "boolean") {
      out[k] = v;
    }
  }
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const url = new URL(req.url);
  const requested = url.searchParams.get("table") ?? DEFAULT_TABLE;
  const table = ALLOWED_TABLES[requested];
  const ts = Math.floor(Date.now() / 1000);

  if (!table) {
    return new Response(JSON.stringify({ ok: false, ts }), { status: 400, headers: cors });
  }

  try {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return new Response(JSON.stringify({ ok: false, ts }), { status: 200, headers: cors });
    }

    const payload = { ...flatten(data as Record<string, unknown>), ts };
    let body = JSON.stringify(payload);

    // Enforce <256 byte limit — drop keys until it fits.
    if (body.length > 256) {
      const entries = Object.entries(payload).filter(([k]) => k !== "ts");
      while (body.length > 256 && entries.length) {
        entries.pop();
        body = JSON.stringify({ ...Object.fromEntries(entries), ts });
      }
    }

    return new Response(body, { status: 200, headers: cors });
  } catch {
    return new Response(JSON.stringify({ ok: false, ts }), { status: 500, headers: cors });
  }
});
