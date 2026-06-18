import { PPSConfig } from '../../types/picopd';

interface PpsControlProps {
  config: PPSConfig;
  onChange: (config: PPSConfig) => void;
  isActive: boolean;
}

export default function PpsControl({ config, onChange, isActive }: PpsControlProps) {
  const setVoltage = (v: number) => onChange({ ...config, targetVoltage: v });
  const setCurrent = (a: number) => onChange({ ...config, currentLimit: a });

  return (
    <div className="rounded-xl bg-white p-4">
      <div className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
        PPS control
      </div>

      <div className="space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Target voltage</span>
            <span className="font-mono tabular-nums text-gray-900">
              {config.targetVoltage.toFixed(1)} V
            </span>
          </div>
          <input
            type="range"
            min={3.3}
            max={21.0}
            step={0.1}
            value={config.targetVoltage}
            onChange={(e) => setVoltage(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-medium text-gray-700">Current limit</span>
            <span className="font-mono tabular-nums text-gray-900">
              {config.currentLimit.toFixed(1)} A
            </span>
          </div>
          <input
            type="range"
            min={0.1}
            max={5.0}
            step={0.1}
            value={config.currentLimit}
            onChange={(e) => setCurrent(parseFloat(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <div className="flex items-center justify-between gap-3 pt-1">
          {isActive ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              PPS active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              PPS inactive — select PPS mode
            </span>
          )}

          <button
            disabled={!isActive}
            className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
