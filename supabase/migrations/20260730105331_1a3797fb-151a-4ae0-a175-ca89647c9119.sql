CREATE TABLE public.devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id text NOT NULL UNIQUE,
  name text NOT NULL,
  manufacturer text,
  voltage numeric,
  current numeric,
  polarity text,
  power numeric,
  connector text,
  connector_type text,
  observations text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.devices TO anon;
GRANT SELECT ON public.devices TO authenticated;
GRANT ALL ON public.devices TO service_role;

ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Devices are publicly readable"
ON public.devices FOR SELECT
USING (true);

CREATE TABLE public.sync_state (
  job text PRIMARY KEY,
  last_run_at timestamptz,
  status text,
  rows_synced integer NOT NULL DEFAULT 0,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sync_state TO anon;
GRANT SELECT ON public.sync_state TO authenticated;
GRANT ALL ON public.sync_state TO service_role;

ALTER TABLE public.sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sync state is publicly readable"
ON public.sync_state FOR SELECT
USING (true);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_devices_updated_at
BEFORE UPDATE ON public.devices
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_sync_state_updated_at
BEFORE UPDATE ON public.sync_state
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX devices_name_idx ON public.devices (lower(name));
CREATE INDEX devices_manufacturer_idx ON public.devices (lower(manufacturer));