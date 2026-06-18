import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bookmark, Download } from 'lucide-react';

import ConnectionBar from '../components/dashboard/ConnectionBar';
import TelemetryCards from '../components/dashboard/TelemetryCards';
import PdoSelector from '../components/dashboard/PdoSelector';
import PpsControl from '../components/dashboard/PpsControl';
import OledPreview from '../components/dashboard/OledPreview';
import EventLog, { LogEvent } from '../components/dashboard/EventLog';

import { useTelemetry } from '../hooks/useTelemetry';
import { useSerial } from '../hooks/useSerial';
import {
  PDO,
  PPSConfig,
  TelemetryReading,
} from '../types/picopd';

const PDOS: PDO[] = [
  { index: 0, voltage: 5,  current: 3,    type: 'fixed' },
  { index: 1, voltage: 9,  current: 3,    type: 'fixed' },
  { index: 2, voltage: 12, current: 3,    type: 'fixed' },
  { index: 3, voltage: 20, current: 3.25, type: 'fixed' },
  { index: 4, voltage: 0,  current: 0,    type: 'pps', minVoltage: 3.3, maxVoltage: 21 },
];

const SEED_EVENTS: LogEvent[] = (() => {
  const now = Date.now();
  const seed: Array<Omit<LogEvent, 'timestamp'>> = [
    { type: 'info', message: 'Awaiting hardware connection…' },
  ];
  return seed.map((e, i) => ({
    ...e,
    timestamp: now - (seed.length - 1 - i) * 24_000,
  }));
})();

const HISTORY_LIMIT = 60;

export default function Dashboard() {
  const navigate = useNavigate();
  const [activePdoIndex, setActivePdoIndex] = useState<number>(3);
  const [ppsConfig, setPpsConfig] = useState<PPSConfig>({ targetVoltage: 12.0, currentLimit: 2.0 });
  const [events, setEvents] = useState<LogEvent[]>(SEED_EVENTS);

  // Real serial readings populate these when hardware is connected
  const [serialReading, setSerialReading] = useState<TelemetryReading | null>(null);
  const [serialHistory, setSerialHistory] = useState<TelemetryReading[]>([]);

  const pushEvent = useCallback((ev: Omit<LogEvent, 'timestamp'>) => {
    setEvents(prev => [...prev.slice(-199), { ...ev, timestamp: Date.now() }]);
  }, []);

  const handleReading = useCallback((r: TelemetryReading) => {
    setSerialReading(r);
    setSerialHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), r]);
  }, []);

  const serial = useSerial({
    autoReconnect: true,
    onReading: handleReading,
    onEvent: pushEvent,
  });

  // Fallback simulated telemetry — runs only when not connected to real hardware
  const simulated = useTelemetry(serial.status !== 'connected', 250);

  const isLive = serial.status === 'connected' && serialReading !== null;
  const reading = isLive ? serialReading! : simulated.current;
  const history = isLive ? serialHistory : simulated.history;

  const activePdo = PDOS.find(p => p.index === activePdoIndex) ?? null;
  const activePdoType = activePdo?.type;

  const handleSelectPdo = useCallback((pdo: PDO) => {
    setActivePdoIndex(pdo.index);
    if (pdo.type === 'pps') {
      pushEvent({ type: 'info', message: `PDO ${pdo.index} selected · PPS mode` });
    } else {
      pushEvent({
        type: 'info',
        message: `PDO ${pdo.index} selected · ${pdo.voltage}V/${pdo.current}A`,
      });
    }
    // Best-effort forward to firmware
    void serial.sendCommand(
      JSON.stringify({ cmd: 'pdo', index: pdo.index, type: pdo.type })
    );
  }, [pushEvent, serial]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ConnectionBar
        status={serial.status}
        deviceInfo={serial.deviceInfo}
        onConnect={() => void serial.connect()}
        onDisconnect={() => void serial.disconnect()}
      />

      {!serial.supported && (
        <div className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-sm text-amber-800">
          WebSerial is not supported in this browser. Use Chrome or Edge on desktop.
        </div>
      )}

      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <TelemetryCards
          reading={reading}
          history={history}
          precision={2}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <PdoSelector
            pdos={PDOS}
            activePdoIndex={activePdoIndex}
            onSelectPdo={handleSelectPdo}
          />
          <PpsControl
            config={ppsConfig}
            onChange={setPpsConfig}
            isActive={activePdoType === 'pps'}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OledPreview
            reading={reading}
            activePdo={activePdo}
            deviceInfo={serial.deviceInfo}
          />
          <EventLog events={events} />
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={() => navigate('/settings')}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <button
            onClick={() => navigate('/settings#presets')}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Bookmark className="h-4 w-4" />
            Presets
          </button>
          <button
            onClick={() => navigate('/settings#data')}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export
          </button>
        </div>
      </main>
    </div>
  );
}
