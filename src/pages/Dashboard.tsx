import { useCallback, useRef, useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Settings, Bookmark, Download, ShieldAlert } from 'lucide-react';

import ConnectionBar from '../components/dashboard/ConnectionBar';
import TelemetryCards from '../components/dashboard/TelemetryCards';
import PdoSelector from '../components/dashboard/PdoSelector';
import PpsControl from '../components/dashboard/PpsControl';
import OledPreview from '../components/dashboard/OledPreview';
import EventLog, { LogEvent } from '../components/dashboard/EventLog';
import DeviceProfileSelector from '../components/dashboard/DeviceProfileSelector';
import StageArmCard, { type StagedTarget } from '../components/dashboard/StageArmCard';

import { useTelemetry } from '../hooks/useTelemetry';
import { usePicoSerial, type PicoCommand } from '../hooks/usePicoSerial';
import {
  DEVICES,
  MANUAL_IDX,
  isFirmwareProfile,
  type MusicalDevice,
} from '../data/devices';
import type { PowerPolarity } from '../data/devicePower';
import { evaluatePreflight } from '../lib/preflight';
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

/** The PicoPD DC jack is wired center-positive. Inverter cable required for C−. */
const SUPPLY_POLARITY: PowerPolarity = 'center_positive';

const SEED_EVENTS: LogEvent[] = [
  { type: 'info', message: 'Awaiting hardware connection…', timestamp: Date.now() },
];

const HISTORY_LIMIT = 60;

interface PendingSend {
  message: string;
  detail: string;
  run: () => void;
}

const targetKey = (t: StagedTarget | null) =>
  t ? `${t.name}|${t.mode}|${t.voltage.toFixed(2)}|${t.current.toFixed(2)}` : 'none';

export default function Dashboard() {
  const navigate = useNavigate();
  const [activePdoIndex, setActivePdoIndex] = useState<number>(3);
  const [ppsConfig, setPpsConfig] = useState<PPSConfig>({ targetVoltage: 12.0, currentLimit: 2.0 });
  const [events, setEvents] = useState<LogEvent[]>(SEED_EVENTS);
  const [activeProfileName, setActiveProfileName] = useState<string | null>(null);
  const [activeDevice, setActiveDevice] = useState<MusicalDevice | null>(null);
  const [pendingSend, setPendingSend] = useState<PendingSend | null>(null);

  // --- Staging state: nothing reaches the hardware until Apply & Power On ---
  const [staged, setStaged] = useState<StagedTarget | null>(null);
  const [armed, setArmed] = useState(false);
  const [appliedTarget, setAppliedTarget] = useState<StagedTarget | null>(null);

  const [serialReading, setSerialReading] = useState<TelemetryReading | null>(null);
  const [serialHistory, setSerialHistory] = useState<TelemetryReading[]>([]);

  const pushEvent = useCallback((ev: Omit<LogEvent, 'timestamp'>) => {
    setEvents(prev => [...prev.slice(-199), { ...ev, timestamp: Date.now() }]);
  }, []);

  const handleReading = useCallback((r: TelemetryReading) => {
    setSerialReading(r);
    setSerialHistory(prev => [...prev.slice(-(HISTORY_LIMIT - 1)), r]);
  }, []);

  // Encoder navigation: rotating the hardware encoder cycles device profiles.
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

  const serial = usePicoSerial({
    autoReconnect: true,
    onReading: handleReading,
    onEvent: pushEvent,
    onEncoder: handleEncoder,
  });

  const simulated = useTelemetry(serial.status !== 'connected', 250);

  const isLive = serial.status === 'connected' && serialReading !== null;
  const reading = isLive ? serialReading! : simulated.current;
  const history = isLive ? serialHistory : simulated.history;

  const activePdo = PDOS.find(p => p.index === activePdoIndex) ?? null;
  const activePdoType = activePdo?.type;

  // Optimistic UI state — only used to preview the OLED when no hardware echo.
  const [optimisticState, setOptimisticState] = useState<{
    state: 0 | 3; voltage: number; current: number; name: string;
  } | null>(null);

  // --------------------------------------------------------------------------
  // Raw transport — every caller must go through requestSend() below.
  // --------------------------------------------------------------------------
  const dispatch = useCallback(
    async (cmds: PicoCommand[]) => {
      for (const cmd of cmds) {
        const ok = await serial.send(cmd);
        if (!ok) {
          pushEvent({ type: 'warning', message: 'Not connected — command not sent to hardware' });
          return;
        }
      }
    },
    [serial, pushEvent],
  );

  /**
   * Safety pipeline. NOTHING reaches the serial writer without passing here.
   */
  const requestSend = useCallback(
    (opts: {
      state: 0 | 3;
      voltage: number;
      current: number;
      name: string;
      mode: 'fixed' | 'pps';
      device?: MusicalDevice | null;
      onCommitted?: () => void;
    }) => {
      const { state, voltage, current, name, mode, device, onCommitted } = opts;

      const commit = () => {
        const cmds: PicoCommand[] = [];
        if (state === 0) {
          cmds.push({ output: 'off' });
        } else if (device && isFirmwareProfile(name)) {
          cmds.push({ select: name });
          cmds.push({ output: 'on' });
        } else {
          cmds.push({ set: mode, v: Number(voltage.toFixed(2)), i: Number(current.toFixed(2)) });
          cmds.push({ output: 'on' });
        }
        void dispatch(cmds);
        setOptimisticState({ state, voltage, current, name });
        onCommitted?.();
      };

      // Powering down is always allowed.
      if (state === 0) {
        commit();
        return;
      }

      const report = evaluatePreflight({ voltage, current, device, supplyPolarity: SUPPLY_POLARITY });

      if (report.blocked) {
        pushEvent({ type: 'error', message: `BLOCKED · ${report.blocked.message}` });
        return;
      }

      report.warnings.forEach(w =>
        pushEvent({ type: w.level === 'danger' ? 'error' : 'warning', message: w.message }),
      );

      if (report.confirm) {
        const confirmation = report.confirm;
        pushEvent({ type: 'warning', message: `Confirmation required · ${confirmation.code}` });
        setPendingSend({
          message: confirmation.message,
          detail: `${name} · ${voltage.toFixed(1)}V / ${current.toFixed(1)}A`,
          run: () => {
            pushEvent({ type: 'warning', message: `User confirmed polarity override · ${name}` });
            commit();
          },
        });
        return;
      }

      commit();
    },
    [dispatch, pushEvent],
  );

  // --------------------------------------------------------------------------
  // Staging — selections only change the staged target.
  // --------------------------------------------------------------------------
  const stageTarget = useCallback((t: StagedTarget) => {
    setStaged(t);
    setArmed(false);
  }, []);

  const handleSelectPdo = useCallback((pdo: PDO) => {
    setActivePdoIndex(pdo.index);
    if (pdo.type === 'pps') {
      pushEvent({ type: 'info', message: `Staged · PPS ${ppsConfig.targetVoltage.toFixed(1)}V / ${ppsConfig.currentLimit.toFixed(1)}A` });
      stageTarget({
        name: activeDevice?.name ?? 'PPS',
        voltage: ppsConfig.targetVoltage,
        current: ppsConfig.currentLimit,
        mode: 'pps',
        source: 'pps',
        polarityLabel: activeDevice?.polarityLabel,
      });
    } else {
      pushEvent({ type: 'info', message: `Staged · PDO ${pdo.index} — ${pdo.voltage}V/${pdo.current}A` });
      stageTarget({
        name: `PDO ${pdo.index}`,
        voltage: pdo.voltage,
        current: pdo.current,
        mode: 'fixed',
        source: 'pdo',
        polarityLabel: activeDevice?.polarityLabel,
      });
    }
  }, [pushEvent, ppsConfig, activeDevice, stageTarget]);

  // PPS sliders restage (never send) while PPS mode is the selected PDO.
  useEffect(() => {
    if (activePdoType !== 'pps') return;
    setStaged(prev => {
      const next: StagedTarget = {
        name: prev?.source === 'pps' ? prev.name : 'PPS',
        voltage: ppsConfig.targetVoltage,
        current: ppsConfig.currentLimit,
        mode: 'pps',
        source: 'pps',
        polarityLabel: prev?.polarityLabel,
      };
      return next;
    });
    setArmed(false);
  }, [ppsConfig.targetVoltage, ppsConfig.currentLimit, activePdoType]);

  const handleApplyPps = useCallback(() => {
    stageTarget({
      name: activeDevice?.name ?? 'PPS',
      voltage: ppsConfig.targetVoltage,
      current: ppsConfig.currentLimit,
      mode: 'pps',
      source: 'pps',
      polarityLabel: activeDevice?.polarityLabel,
    });
    pushEvent({
      type: 'info',
      message: `Staged · PPS ${ppsConfig.targetVoltage.toFixed(1)}V / ${ppsConfig.currentLimit.toFixed(1)}A — arm to apply`,
    });
  }, [ppsConfig, pushEvent, activeDevice, stageTarget]);

  const handleSelectProfile = useCallback((device: MusicalDevice) => {
    setActiveProfileName(device.name);
    setActiveDevice(device);

    if (device.voltage == null || device.current == null) {
      setStaged({
        name: device.name,
        voltage: device.voltage ?? 0,
        current: device.current ?? 0,
        mode: 'fixed',
        source: 'profile',
        polarityLabel: device.polarityLabel,
      });
      setArmed(false);
      pushEvent({
        type: 'error',
        message: `BLOCKED · ${device.name} has no verified voltage/current on file. Confirm the spec manually.`,
      });
      return;
    }

    stageTarget({
      name: device.name,
      voltage: device.voltage,
      current: device.current,
      mode: 'fixed',
      source: 'profile',
      polarityLabel: device.polarityLabel,
    });
    pushEvent({
      type: 'info',
      message: `Staged · ${device.name} (${device.voltage.toFixed(1)}V / ${device.current.toFixed(1)}A) — arm to apply`,
    });
  }, [pushEvent, stageTarget]);

  useEffect(() => { handleSelectProfileRef.current = handleSelectProfile; }, [handleSelectProfile]);

  const stagedDevice = useMemo(
    () => (staged?.source === 'profile' || staged?.name === activeDevice?.name ? activeDevice : null),
    [staged, activeDevice],
  );

  const preflight = useMemo(
    () =>
      staged
        ? evaluatePreflight({
            voltage: staged.voltage,
            current: staged.current,
            device: stagedDevice,
            supplyPolarity: SUPPLY_POLARITY,
          })
        : null,
    [staged, stagedDevice],
  );

  const isDirty = targetKey(staged) !== targetKey(appliedTarget);

  const handleApplyStaged = useCallback(() => {
    if (!staged || !armed) return;
    pushEvent({
      type: 'info',
      message: `Apply & Power On · ${staged.name} — ${staged.voltage.toFixed(1)}V / ${staged.current.toFixed(1)}A`,
    });
    requestSend({
      state: 3,
      voltage: staged.voltage,
      current: staged.current,
      name: staged.name,
      mode: staged.mode,
      device: stagedDevice,
      onCommitted: () => {
        setAppliedTarget(staged);
        setArmed(false);
      },
    });
  }, [staged, armed, stagedDevice, requestSend, pushEvent]);

  const handleDiscardStaged = useCallback(() => {
    setStaged(appliedTarget);
    setArmed(false);
    pushEvent({ type: 'info', message: 'Staged target discarded' });
  }, [appliedTarget, pushEvent]);

  const handleOutputOff = useCallback(() => {
    requestSend({
      state: 0, voltage: 0, current: 0, name: 'MANUAL CONTROL', mode: 'fixed',
      onCommitted: () => { setAppliedTarget(null); setArmed(false); },
    });
    pushEvent({ type: 'warning', message: 'Output OFF · {"output":"off"} sent' });
  }, [requestSend, pushEvent]);

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
      mode: 'FIXED' as const,
      polarity: null,
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
        <TelemetryCards reading={reading} history={history} precision={2} />

        <StageArmCard
          staged={staged}
          preflight={preflight}
          armed={armed}
          onToggleArm={setArmed}
          onApply={handleApplyStaged}
          onDiscard={handleDiscardStaged}
          isDirty={isDirty}
          appliedLabel={
            appliedTarget
              ? `${appliedTarget.name} · ${appliedTarget.voltage.toFixed(1)}V / ${appliedTarget.current.toFixed(1)}A`
              : null
          }
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
          <OledPreview firmwareState={oledState} deviceInfo={oledDeviceInfo} />
          <EventLog events={events} />
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleOutputOff}
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

      {pendingSend && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl border border-red-200 bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center gap-2 text-red-700">
              <ShieldAlert className="h-5 w-5" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">Polarity confirmation required</h2>
            </div>
            <p className="text-sm text-gray-800">{pendingSend.message}</p>
            <p className="mt-2 font-mono text-xs text-gray-500">{pendingSend.detail}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  pushEvent({ type: 'info', message: 'Send cancelled by user (polarity confirmation)' });
                  setPendingSend(null);
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const action = pendingSend;
                  setPendingSend(null);
                  action.run();
                }}
                className="rounded-md border border-red-600 bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                I verified the cable — continue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
