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
import {
  ConnectionStatus,
  DeviceInfo,
  PDO,
  PPSConfig,
} from '../types/picopd';

const PDOS: PDO[] = [
  { index: 0, voltage: 5,  current: 3,    type: 'fixed' },
  { index: 1, voltage: 9,  current: 3,    type: 'fixed' },
  { index: 2, voltage: 12, current: 3,    type: 'fixed' },
  { index: 3, voltage: 20, current: 3.25, type: 'fixed' },
  { index: 4, voltage: 0,  current: 0,    type: 'pps', minVoltage: 3.3, maxVoltage: 21 },
];

const DEFAULT_DEVICE: DeviceInfo = { name: 'GaN 65W', port: 'COM4', pdVersion: 'PD3.1' };

const SEED_EVENTS: LogEvent[] = (() => {
  const now = Date.now();
  const seed: Array<Omit<LogEvent, 'timestamp'>> = [
    { type: 'success', message: 'Connected · GaN 65W' },
    { type: 'info',    message: 'PDO list received · 5 entries' },
    { type: 'success', message: 'PDO 4 accepted · 20V/3.25A' },
    { type: 'info',    message: 'Polling at 250 ms' },
    { type: 'warning', message: 'Current spike 3.1 A' },
  ];
  return seed.map((e, i) => ({
    ...e,
    timestamp: now - (seed.length - 1 - i) * 24_000,
  }));
})();

export default function Dashboard() {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('connected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(DEFAULT_DEVICE);
  const [activePdoIndex, setActivePdoIndex] = useState<number>(3);
  const [ppsConfig, setPpsConfig] = useState<PPSConfig>({ targetVoltage: 12.0, currentLimit: 2.0 });
  const [events, setEvents] = useState<LogEvent[]>(SEED_EVENTS);

  const telemetry = useTelemetry(connectionStatus === 'connected', 250);

  const activePdo = PDOS.find(p => p.index === activePdoIndex) ?? null;
  const activePdoType = activePdo?.type;

  const pushEvent = useCallback((ev: Omit<LogEvent, 'timestamp'>) => {
    setEvents(prev => [...prev, { ...ev, timestamp: Date.now() }]);
  }, []);

  const handleConnect = useCallback(() => {
    setConnectionStatus('connecting');
    setTimeout(() => {
      setConnectionStatus('connected');
      setDeviceInfo(DEFAULT_DEVICE);
      pushEvent({ type: 'success', message: 'Connected · GaN 65W' });
    }, 400);
  }, [pushEvent]);

  const handleDisconnect = useCallback(() => {
    setConnectionStatus('disconnected');
    setDeviceInfo(null);
    pushEvent({ type: 'info', message: 'Disconnected' });
  }, [pushEvent]);

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
  }, [pushEvent]);

  return (
    <div className="min-h-screen bg-gray-50">
      <ConnectionBar
        status={connectionStatus}
        deviceInfo={deviceInfo}
        onConnect={handleConnect}
        onDisconnect={handleDisconnect}
      />

      <main className="mx-auto max-w-5xl space-y-4 p-6">
        <TelemetryCards
          reading={telemetry.current}
          history={telemetry.history}
          precision={2}
        />

        <div className="grid grid-cols-2 gap-4">
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

        <div className="grid grid-cols-2 gap-4">
          <OledPreview
            reading={telemetry.current}
            activePdo={activePdo}
            deviceInfo={deviceInfo}
          />
          <EventLog events={events} />
        </div>

        <div className="flex justify-end gap-2">
          <Link
            to="/settings"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Settings className="h-4 w-4" />
            Settings
          </Link>
          <Link
            to="/settings?tab=presets"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Bookmark className="h-4 w-4" />
            Presets
          </Link>
          <Link
            to="/settings?tab=data"
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <Download className="h-4 w-4" />
            Export
          </Link>
        </div>
      </main>
    </div>
  );
}
