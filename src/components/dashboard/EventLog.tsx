import { useMemo } from 'react';
import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

type EventType = 'info' | 'success' | 'warning' | 'error';

export interface LogEvent {
  timestamp: number;
  message: string;
  type: EventType;
}

interface EventLogProps {
  events?: LogEvent[];
}

const SEED: Array<Omit<LogEvent, 'timestamp'>> = [
  { type: 'success', message: 'Connected · GaN 65W' },
  { type: 'info',    message: 'PDO list received · 5 entries' },
  { type: 'success', message: 'PDO 4 accepted · 20V/3.25A' },
  { type: 'info',    message: 'Polling at 250 ms' },
  { type: 'warning', message: 'Current spike 3.1 A' },
];

function formatTime(ts: number) {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function iconFor(type: EventType) {
  const cls = 'h-3.5 w-3.5 shrink-0';
  if (type === 'success') return <CheckCircle className={cls} />;
  if (type === 'warning') return <AlertTriangle className={cls} />;
  if (type === 'error') return <XCircle className={cls} />;
  return null;
}

function colorFor(type: EventType) {
  switch (type) {
    case 'success': return 'text-green-600';
    case 'warning': return 'text-amber-600';
    case 'error':   return 'text-red-600';
    default:        return 'text-gray-500';
  }
}

export default function EventLog({ events }: EventLogProps) {
  const seeded = useMemo<LogEvent[]>(() => {
    const now = Date.now();
    // Spread across the last ~2 minutes, oldest first
    return SEED.map((e, i) => ({
      ...e,
      timestamp: now - (SEED.length - 1 - i) * 24_000 - Math.floor(Math.random() * 5000),
    }));
  }, []);

  const list = events && events.length ? events : seeded;

  return (
    <div>
      <div className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-400">
        Event log
      </div>
      <div className="max-h-[160px] overflow-y-auto rounded-2xl border border-gray-100 bg-white">
        {list.map((ev, i) => (
          <div
            key={i}
            className={`flex items-center gap-3 px-3 py-2 ${
              i < list.length - 1 ? 'border-b border-gray-100' : ''
            }`}
          >
            <span className="font-mono text-xs text-gray-400 tabular-nums shrink-0">
              {formatTime(ev.timestamp)}
            </span>
            <span className={`flex items-center gap-1.5 text-sm ${colorFor(ev.type)}`}>
              {iconFor(ev.type)}
              <span>{ev.message}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
