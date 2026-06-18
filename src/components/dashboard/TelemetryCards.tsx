import { Zap, Activity, Flame } from 'lucide-react';
import { TelemetryReading } from '../../types/picopd';

interface TelemetryCardsProps {
  reading: TelemetryReading;
  history: TelemetryReading[];
  precision?: number;
}

type MetricKey = 'voltage' | 'current' | 'power';

interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  icon: typeof Zap;
}

const METRICS: Metric[] = [
  { key: 'voltage', label: 'Voltage', unit: 'V', icon: Zap },
  { key: 'current', label: 'Current', unit: 'A', icon: Activity },
  { key: 'power',   label: 'Power',   unit: 'W', icon: Flame },
];

function Sparkline({ values }: { values: number[] }) {
  const bars = values.slice(-12);
  while (bars.length < 12) bars.unshift(0);

  const min = Math.min(...bars);
  const max = Math.max(...bars);
  const range = max - min || 1;
  const MAX_H = 28;

  return (
    <div className="mt-3 flex h-7 items-end gap-[2px]">
      {bars.map((v, i) => {
        const norm = (v - min) / range;
        const h = Math.max(2, Math.round(norm * MAX_H));
        const isLast = i === bars.length - 1;
        return (
          <div
            key={i}
            className={`w-[6px] rounded-sm ${isLast ? 'bg-blue-500' : 'bg-gray-200'}`}
            style={{ height: `${h}px` }}
          />
        );
      })}
    </div>
  );
}

export default function TelemetryCards({ reading, history, precision = 2 }: TelemetryCardsProps) {
  return (
    <div className="grid grid-cols-3 gap-3">
      {METRICS.map(({ key, label, unit, icon: Icon }) => {
        const value = reading[key];
        const series = history.map(h => h[key]);
        return (
          <div key={key} className="rounded-xl bg-gray-50 p-4">
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-semibold tabular-nums text-gray-900">
                {value.toFixed(precision)}
              </span>
              <span className="text-sm font-medium text-gray-500">{unit}</span>
            </div>
            <Sparkline values={series} />
          </div>
        );
      })}
    </div>
  );
}
