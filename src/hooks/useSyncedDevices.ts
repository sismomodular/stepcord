import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { MusicalDevice, Polarity } from '../data/devices';

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

/** Normalizes free-form polarity strings from RigPower into the app's polarity type. */
export function normalizePolarity(value: string | null): Polarity {
  const v = (value ?? '').toLowerCase();
  if (v.includes('neg') || v === 'c-' || v === 'center_negative') {
    return 'center-negative';
  }
  return 'center-positive';
}

/** Maps a synced device onto the profile shape used by the PicoPD auto-config logic. */
export function toMusicalDevice(d: SyncedDevice): MusicalDevice {
  const defaultPolarity = normalizePolarity(d.polarity);
  return {
    name: d.name,
    brand: d.manufacturer ?? undefined,
    voltage: d.voltage ?? 5,
    current: d.current ?? 1,
    defaultPolarity,
    polarityLabel:
      defaultPolarity === 'center-negative' ? 'USE INVERTER C-' : 'KEEP CENTER + ',
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
