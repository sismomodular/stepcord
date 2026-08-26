import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { POLARITY_LABELS, type MusicalDevice, type Polarity } from '../data/devices';

export interface SyncedDevice {
  id: string;
  source_id: string;
  name: string;
  manufacturer: string | null;
  voltage: number | null;
  current: number | null;
  polarity: string | null;
  power: number | null;
  connector: string | null;
  connector_type: string | null;
  observations: string | null;
  last_synced_at: string;
}

export interface SyncState {
  job: string;
  last_run_at: string | null;
  status: string | null;
  rows_synced: number;
  error: string | null;
}

/**
 * Normalizes free-form polarity strings from RigPower.
 * Fails closed: anything not explicitly recognised becomes 'unverified'
 * — never a silent fallback to center-positive.
 */
export function normalizePolarity(value: string | null | undefined): Polarity {
  const v = (value ?? '').trim().toLowerCase();
  if (!v) return 'unverified';

  const negative = ['c-', 'c −', 'c–', 'center-negative', 'center_negative', 'centre-negative', 'negative', 'neg'];
  const positive = ['c+', 'center-positive', 'center_positive', 'centre-positive', 'positive', 'pos'];

  if (negative.includes(v) || /(^|[^a-z])neg/.test(v)) return 'center-negative';
  if (positive.includes(v) || /(^|[^a-z])pos/.test(v)) return 'center-positive';
  return 'unverified';
}

/**
 * Maps a synced device onto the profile shape used by the auto-config logic.
 * Missing voltage/current stay `null` — no invented defaults.
 */
export function toMusicalDevice(d: SyncedDevice): MusicalDevice {
  const defaultPolarity = normalizePolarity(d.polarity);
  const voltage = typeof d.voltage === 'number' && Number.isFinite(d.voltage) ? d.voltage : null;
  const current = typeof d.current === 'number' && Number.isFinite(d.current) ? d.current : null;
  return {
    name: d.name,
    brand: d.manufacturer ?? undefined,
    voltage,
    current,
    defaultPolarity,
    polarityLabel: POLARITY_LABELS[defaultPolarity],
    verified: voltage != null && current != null && defaultPolarity !== 'unverified',
    source: 'synced',
  };
}

export function useSyncedDevices() {
  const [devices, setDevices] = useState<SyncedDevice[]>([]);
  const [syncState, setSyncState] = useState<SyncState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [devRes, stateRes] = await Promise.all([
      supabase
        .from('devices')
        .select('*')
        .order('manufacturer', { ascending: true })
        .order('name', { ascending: true }),
      supabase
        .from('sync_state')
        .select('*')
        .eq('job', 'rigpower-devices')
        .maybeSingle(),
    ]);

    if (!devRes.error && devRes.data) {
      setDevices(devRes.data as unknown as SyncedDevice[]);
    }
    if (!stateRes.error && stateRes.data) {
      setSyncState(stateRes.data as unknown as SyncState);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { devices, syncState, loading, refresh };
}
