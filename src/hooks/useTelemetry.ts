import { useState, useEffect, useRef } from 'react';
import { TelemetryReading } from '../types/picopd';

export function useTelemetry(isConnected: boolean, pollingMs = 250) {
  const [current, setCurrent] = useState<TelemetryReading>({
    voltage: 20.0, current: 1.8, power: 36.0, timestamp: Date.now()
  });
  const [history, setHistory] = useState<TelemetryReading[]>([]);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!isConnected) return;
    intervalRef.current = setInterval(() => {
      const v = parseFloat((20.0 + (Math.random() - 0.5) * 0.1).toFixed(2));
      const a = parseFloat((1.8 + (Math.random() - 0.5) * 0.2).toFixed(2));
      const reading: TelemetryReading = {
        voltage: v,
        current: a,
        power: parseFloat((v * a).toFixed(2)),
        timestamp: Date.now()
      };
      setCurrent(reading);
      setHistory(prev => [...prev.slice(-59), reading]);
    }, pollingMs);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isConnected, pollingMs]);

  return { current, history };
}
