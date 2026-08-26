import { useState } from 'react';
import { RefreshCw, Cloud } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useSyncedDevices } from '../../hooks/useSyncedDevices';

const btnCls =
  'inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50';

function formatDate(iso: string | null) {
  if (!iso) return 'Never';
  return new Date(iso).toLocaleString();
}

export default function DeviceSyncSettings() {
  const { devices, syncState, loading, refresh } = useSyncedDevices();
  const [syncing, setSyncing] = useState(false);
  const [secret, setSecret] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);

  const runSync = async () => {
    if (!secret.trim()) {
      setMessage({ kind: 'error', text: 'Sync trigger secret is required to run a manual sync.' });
      return;
    }
    setSyncing(true);
    setMessage(null);
    try {
      const { data, error } = await supabase.functions.invoke('sync-rigpower-devices', {
        body: {},
        headers: { 'x-sync-secret': secret.trim() },
      });
      if (error) throw new Error(error.message);
      if (data && data.ok === false) throw new Error(data.error ?? 'Sync failed');
      setMessage({ kind: 'ok', text: `Synced ${data?.rows ?? 0} devices from RigPower.` });
      await refresh();
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      setMessage({ kind: 'error', text });
      await refresh();
    } finally {
      setSyncing(false);
    }
  };


  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Cloud className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">Device sync (RigPower)</h2>
      </div>

      <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">Last synchronization</div>
          <div className="mt-0.5 text-xs text-gray-400">
            {loading ? 'Loading…' : formatDate(syncState?.last_run_at ?? null)}
            {syncState?.status ? ` · ${syncState.status}` : ''}
          </div>
        </div>
        <button onClick={runSync} disabled={syncing} className={btnCls}>
          <RefreshCw className={`h-4 w-4 ${syncing ? 'animate-spin' : ''}`} />
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <div className="flex items-center justify-between gap-4 py-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-gray-900">Cached devices</div>
          <div className="mt-0.5 text-xs text-gray-400">
            RigPower is the source of truth — this copy is read-only.
          </div>
        </div>
        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium tabular-nums text-gray-700">
          {devices.length}
        </span>
      </div>

      {(message || syncState?.error) && (
        <div
          className={`rounded-md px-3 py-2 text-xs ${
            message?.kind === 'ok'
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-red-50 text-red-700'
          }`}
        >
          {message?.text ?? syncState?.error}
        </div>
      )}
    </section>
  );
}
