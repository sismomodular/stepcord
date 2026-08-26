import { useMemo, useState } from 'react';
import { DEVICES, MANUAL_IDX, type MusicalDevice } from '../../data/devices';
import { useSyncedDevices, toMusicalDevice } from '../../hooks/useSyncedDevices';

interface DeviceProfileSelectorProps {
  activeName: string | null;
  onSelect: (device: MusicalDevice) => void;
}

const fmt = (n: number | null, unit: string) => (n == null ? `— ${unit}` : `${n.toFixed(1)} ${unit}`);

export default function DeviceProfileSelector({ activeName, onSelect }: DeviceProfileSelectorProps) {
  const [query, setQuery] = useState('');
  const { devices: synced } = useSyncedDevices();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEVICES.map((d, i) => ({ d, i })).filter(({ d, i }) => {
      if (i === MANUAL_IDX) return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        (d.brand ?? '').toLowerCase().includes(q)
      );
    });
  }, [query]);

  const syncedProfiles = useMemo(() => {
    const localNames = new Set(DEVICES.map(d => d.name.toLowerCase()));
    const q = query.trim().toLowerCase();
    return synced
      .map(toMusicalDevice)
      .filter(d => !localNames.has(d.name.toLowerCase()))
      .filter(d =>
        !q ||
        d.name.toLowerCase().includes(q) ||
        (d.brand ?? '').toLowerCase().includes(q),
      );
  }, [synced, query]);

  const activeDevice =
    DEVICES.find(d => d.name === activeName) ??
    syncedProfiles.find(d => d.name === activeName) ??
    null;

  const bannerTone = (d: MusicalDevice) =>
    !d.verified
      ? 'border-slate-300 bg-slate-100 text-slate-800'
      : d.defaultPolarity === 'center-negative'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : 'border-emerald-200 bg-emerald-50 text-emerald-900';

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-widest text-gray-400">
          Device profiles
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search device or brand…"
          className="w-44 rounded-md border border-gray-200 bg-gray-50 px-2 py-1 text-xs text-gray-700 placeholder:text-gray-400 focus:border-blue-400 focus:bg-white focus:outline-none"
        />
      </div>

      {activeDevice && (
        <div
          className={['mb-3 flex items-start gap-2 rounded-lg border px-3 py-2 text-xs', bannerTone(activeDevice)].join(' ')}
          role="status"
        >
          <span aria-hidden className="mt-0.5">
            {!activeDevice.verified ? '?' : activeDevice.defaultPolarity === 'center-negative' ? '⚠' : '✓'}
          </span>
          <div className="min-w-0">
            <div className="font-semibold uppercase tracking-wide">
              Polarity · {activeDevice.polarityLabel.trim()}
            </div>
            <div className="opacity-80">
              {!activeDevice.verified ? (
                <>
                  Incomplete data for {activeDevice.name}
                  {activeDevice.voltage == null && ' (no voltage on file)'}
                  {activeDevice.current == null && ' (no current on file)'}
                  . Not verified — confirm the spec manually before connecting.
                </>
              ) : (
                <>
                  {activeDevice.name} expects{' '}
                  <span className="font-mono">{activeDevice.defaultPolarity}</span>.
                  {activeDevice.defaultPolarity === 'center-negative' &&
                    ' Use the inverter cable before powering on.'}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="max-h-64 overflow-y-auto pr-1">
        <ul className="space-y-1">
          {filtered.map(({ d }) => (
            <DeviceRow key={d.name} d={d} isActive={activeName === d.name} onSelect={onSelect} />
          ))}

          {syncedProfiles.length > 0 && (
            <li className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
              Synced from RigPower
            </li>
          )}
          {syncedProfiles.map(d => (
            <DeviceRow key={`sync-${d.name}`} d={d} isActive={activeName === d.name} onSelect={onSelect} />
          ))}

          {filtered.length === 0 && syncedProfiles.length === 0 && (
            <li className="px-3 py-6 text-center text-xs text-gray-400">
              No devices match “{query}”.
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}

function DeviceRow({
  d, isActive, onSelect,
}: {
  d: MusicalDevice;
  isActive: boolean;
  onSelect: (device: MusicalDevice) => void;
}) {
  const unverified = !d.verified;
  const polTag = unverified
    ? '?'
    : d.defaultPolarity === 'center-positive' ? 'C+' : 'C−';

  return (
    <li>
      <button
        onClick={() => onSelect(d)}
        className={[
          'flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left transition-colors duration-150',
          isActive
            ? 'border border-blue-400 bg-blue-50'
            : 'border border-transparent hover:bg-gray-50',
        ].join(' ')}
      >
        <div className="min-w-0">
          <div className={`truncate text-sm font-medium ${isActive ? 'text-blue-800' : 'text-gray-900'}`}>
            {d.name}
          </div>
          {d.brand && <div className="truncate text-xs text-gray-500">{d.brand}</div>}
          {unverified && (
            <div className="mt-0.5 truncate text-[10px] font-medium text-slate-500">
              Not verified — confirm manually before connecting
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span
            className={[
              'rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
              unverified
                ? 'bg-slate-200 text-slate-700'
                : d.defaultPolarity === 'center-negative'
                  ? 'bg-amber-100 text-amber-800'
                  : 'bg-emerald-100 text-emerald-800',
            ].join(' ')}
            title={d.polarityLabel.trim()}
          >
            {polTag}
          </span>
          <div className="text-right tabular-nums">
            <div className={`text-sm font-medium ${isActive ? 'text-blue-800' : 'text-gray-900'}`}>
              {fmt(d.voltage, 'V')}
            </div>
            <div className="text-xs text-gray-500">{fmt(d.current, 'A')}</div>
          </div>
        </div>
      </button>
    </li>
  );
}
