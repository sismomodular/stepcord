import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bookmark, Download } from 'lucide-react';

import ConnectionBar from '../components/dashboard/ConnectionBar';
import TelemetryCards from '../components/dashboard/TelemetryCards';
import PdoSelector from '../components/dashboard/PdoSelector';
import PpsControl from '../components/dashboard/PpsControl';
import OledPreview from '../components/dashboard/OledPreview';
import EventLog, { LogEvent } from '../components/dashboard/EventLog';
import DeviceProfileSelector from '../components/dashboard/DeviceProfileSelector';

import { useTelemetry } from '../hooks/useTelemetry';
import { useSerial } from '../hooks/useSerial';
import { DEVICES, MANUAL_IDX, type MusicalDevice } from '../data/devices';
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
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);

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

  // Encoder navigation: rotating the hardware encoder cycles through device
  // profiles (excluding the Manual Mode entry) and applies the selection.
  const handleSelectProfileRef = useRef<((d: MusicalDevice) => void) | null>(null);
  const activeProfileNameRef = useRef<string | null>(activeProfileName);
  useEffect(() => { activeProfileNameRef.current = activeProfileName; }, [activeProfileName]);

  const handleEncoder = useCallback((dir: 'CW' | 'CCW') => {
    const browsable = DEVICES.filter((_, i) => i !== MANUAL_IDX);
    if (browsable.length === 0) return;
    const currentName = activeProfileNameRef.current;
    const currentIdx = browsable.findIndex(d => d.name === currentName);
    const step = dir === 'CW' ? 1 : -1;
    const nextIdx =
      currentIdx < 0
        ? (dir === 'CW' ? 0 : browsable.length - 1)
        : (currentIdx + step + browsable.length) % browsable.length;
    handleSelectProfileRef.current?.(browsable[nextIdx]);
  }, []);

  const serial = useSerial({
    autoReconnect: true,
    onReading: handleReading,
    onEvent: pushEvent,
    onEncoder: handleEncoder,
  });

  // Fallback simulated telemetry — runs only when not connected to real hardware
  const simulated = useTelemetry(serial.status !== 'connected', 250);

  const isLive = serial.status === 'connected' && serialReading !== null;
  const reading = isLive ? serialReading! : simulated.current;
  const history = isLive ? serialHistory : simulated.history;

  const activePdo = PDOS.find(p => p.index === activePdoIndex) ?? null;
  const activePdoType = activePdo?.type;

  // Optimistic firmware state — reflects what the web UI has requested,
  // so the OLED preview shows PPS / profile selections even without hardware.
  const [optimisticState, setOptimisticState] = useState<{
    state: 0 | 3; voltage: number; current: number; name: string;
  } | null>(null);

  // Firmware protocol: "state,voltage,current,name\n"
  // state: 0 = STANDBY (output off), 3 = LIVE (output on)
  const sendProfile = useCallback(
    (state: 0 | 3, voltage: number, current: number, name: string) => {
      const line = `${state},${voltage.toFixed(1)},${current.toFixed(1)},${name}`;
      void serial.sendCommand(line);
      setOptimisticState({ state, voltage, current, name });
    },
    [serial],
  );

  const handleSelectPdo = useCallback((pdo: PDO) => {
    setActivePdoIndex(pdo.index);
    if (pdo.type === 'pps') {
      pushEvent({ type: 'info', message: `PDO ${pdo.index} selected · PPS mode` });
      sendProfile(3, ppsConfig.targetVoltage, ppsConfig.currentLimit, 'PPS');
    } else {
      pushEvent({
        type: 'info',
        message: `PDO ${pdo.index} selected · ${pdo.voltage}V/${pdo.current}A`,
      });
      sendProfile(3, pdo.voltage, pdo.current, `PDO ${pdo.index}`);
    }
  }, [pushEvent, sendProfile, ppsConfig]);

  const handleApplyPps = useCallback(() => {
    sendProfile(3, ppsConfig.targetVoltage, ppsConfig.currentLimit, 'PPS');
    pushEvent({
      type: 'info',
      message: `PPS apply · ${ppsConfig.targetVoltage.toFixed(1)}V / ${ppsConfig.currentLimit.toFixed(1)}A`,
    });
  }, [ppsConfig, sendProfile, pushEvent]);

  // Live PPS: while PPS mode is active, changes to the sliders update the
  // firmware/OLED immediately — no need to click Apply for each tweak.
  useEffect(() => {
    if (activePdoType !== 'pps') return;
    const t = setTimeout(() => {
      sendProfile(3, ppsConfig.targetVoltage, ppsConfig.currentLimit, 'PPS');
    }, 120);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppsConfig.targetVoltage, ppsConfig.currentLimit, activePdoType]);

  const handleSelectProfile = useCallback((device: MusicalDevice) => {
    setActiveProfileName(device.name);
    sendProfile(3, device.voltage, device.current, device.name);
    pushEvent({
      type: 'info',
      message: `Profile · ${device.name} (${device.voltage.toFixed(1)}V / ${device.current.toFixed(1)}A)`,
    });
  }, [sendProfile, pushEvent]);

  useEffect(() => { handleSelectProfileRef.current = handleSelectProfile; }, [handleSelectProfile]);

  // OLED preview: prefer real firmware echo when connected, else optimistic UI state.
  const oledState = useMemo(() => {
    if (serial.firmwareState) return serial.firmwareState;
    if (!optimisticState) return null;
    const isWebMode =
      optimisticState.name.length > 0 &&
      optimisticState.name !== 'MANUAL CONTROL' &&
      optimisticState.name !== 'MANUAL VOLTAGE';
    return {
      state: optimisticState.state,
      targetVoltage: optimisticState.voltage,
      targetCurrent: optimisticState.current,
      name: optimisticState.name || 'MANUAL CONTROL',
      isWebMode,
      timestamp: Date.now(),
    };
  }, [serial.firmwareState, optimisticState]);

  const oledDeviceInfo = serial.deviceInfo ?? (optimisticState
    ? { name: 'Preview', port: 'web', pdVersion: 'PD3.1' }
    : null);


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
            onApply={handleApplyPps}
          />
        </div>

        <DeviceProfileSelector
          activeName={activeProfileName}
          onSelect={handleSelectProfile}
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <OledPreview
            firmwareState={oledState}
            deviceInfo={oledDeviceInfo}
          />
          <EventLog events={events} />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={() => {
              void serial.sendCommand('STOP');
              setOptimisticState(prev => prev ? { ...prev, state: 0 } : { state: 0, voltage: 0, current: 0, name: 'MANUAL CONTROL' });
              pushEvent({ type: 'warning', message: 'Output OFF · STOP sent' });
            }}
            className="inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            Output Off
          </button>
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
