CREATE TABLE public.monitor (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  label text,
  voltage numeric,
  current numeric,
  power numeric,
  output_enabled boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT ON public.monitor TO anon;
GRANT SELECT ON public.monitor TO authenticated;
GRANT ALL ON public.monitor TO service_role;

ALTER TABLE public.monitor ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Monitor readings are publicly readable"
  ON public.monitor FOR SELECT
  USING (true);

CREATE INDEX monitor_created_at_idx ON public.monitor (created_at DESC);

CREATE TRIGGER update_monitor_updated_at
  BEFORE UPDATE ON public.monitor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();