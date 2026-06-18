import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionStatus, DeviceInfo, TelemetryReading } from '../types/picopd';
import type { LogEvent } from '../components/dashboard/EventLog';

export interface FirmwareState {
  /** 0 = STANDBY (output off), 3 = LIVE (output on) */
  state: 0 | 3;
  /** Target voltage from firmware echo (V) */
  targetVoltage: number;
  /** Target current limit from firmware echo (A) */
  targetCurrent: number;
  /** Active device profile name (e.g. "MANUAL CONTROL", "Web Profile", or device name) */
  name: string;
  /** True when name is a web-loaded profile (not MANUAL CONTROL / MANUAL VOLTAGE) */
  isWebMode: boolean;
  /** Timestamp of last echo */
  timestamp: number;
}

interface UseSerialOptions {
  autoReconnect: boolean;
  onReading: (r: TelemetryReading) => void;
  onEvent: (e: Omit<LogEvent, 'timestamp'>) => void;
}

interface UseSerialResult {
  supported: boolean;
  status: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
  firmwareState: FirmwareState | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  sendCommand: (cmd: string) => Promise<void>;
}

type SerialPortLike = {
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
};

export function useSerial({ autoReconnect, onReading, onEvent }: UseSerialOptions): UseSerialResult {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [firmwareState, setFirmwareState] = useState<FirmwareState | null>(null);

  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const userClosedRef = useRef(false);
  const autoReconnectRef = useRef(autoReconnect);
  useEffect(() => { autoReconnectRef.current = autoReconnect; }, [autoReconnect]);

  // Keep latest callbacks without re-binding the read loop
  const onReadingRef = useRef(onReading);
  const onEventRef = useRef(onEvent);
  useEffect(() => { onReadingRef.current = onReading; }, [onReading]);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);

  const cleanupStreams = useCallback(async () => {
    try { await readerRef.current?.cancel(); } catch { /* noop */ }
    try { readerRef.current?.releaseLock(); } catch { /* noop */ }
    readerRef.current = null;
    try { await writerRef.current?.close(); } catch { /* noop */ }
    try { writerRef.current?.releaseLock(); } catch { /* noop */ }
    writerRef.current = null;
  }, []);

  const startReadLoop = useCallback(async (port: SerialPortLike) => {
    if (!port.readable) return;
    const decoder = new TextDecoderStream();
    const closed = (port.readable as ReadableStream<Uint8Array>)
      .pipeTo(decoder.writable as unknown as WritableStream<Uint8Array>)
      .catch(() => { /* stream ended */ });
    const reader = decoder.readable.getReader();
    readerRef.current = reader;

    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        buffer += value;
        let nl: number;
        while ((nl = buffer.indexOf('\n')) >= 0) {
          const line = buffer.slice(0, nl).trim().replace(/\r$/, '');
          buffer = buffer.slice(nl + 1);
          if (!line) continue;

          // Encoder rotation events from firmware: "ENC:CW" / "ENC:CCW"
          if (line.startsWith('ENC:')) {
            const dir = line.slice(4);
            onEventRef.current({
              type: 'info',
              message: `Encoder ${dir === 'CW' ? 'clockwise' : 'counter-clockwise'}`,
            });
            continue;
          }

          // Firmware CSV echo: "state,voltage,current,name"
          // state: 0 = STANDBY, 3 = LIVE
          const parts = line.split(',');
          if (parts.length >= 3) {
            const state = parseInt(parts[0], 10);
            const v = parseFloat(parts[1]);
            const i = parseFloat(parts[2]);
            const name = parts.slice(3).join(',').trim();
            if (Number.isFinite(v) && Number.isFinite(i)) {
              const fwState: 0 | 3 = state === 3 ? 3 : 0;
              const isWebMode =
                name.length > 0 && name !== 'MANUAL CONTROL' && name !== 'MANUAL VOLTAGE';

              setFirmwareState({
                state: fwState,
                targetVoltage: v,
                targetCurrent: i,
                name: name || 'MANUAL CONTROL',
                isWebMode,
                timestamp: Date.now(),
              });

              // Telemetry: when output is off, report zeros for current/power.
              const liveV = fwState === 3 ? v : 0;
              const liveI = fwState === 3 ? i : 0;
              const reading: TelemetryReading = {
                voltage: liveV,
                current: liveI,
                power: parseFloat((liveV * liveI).toFixed(2)),
                timestamp: Date.now(),
              };
              onReadingRef.current(reading);
              onEventRef.current({
                type: fwState === 3 ? 'success' : 'info',
                message: fwState === 3
                  ? `LIVE · ${v.toFixed(1)}V / ${i.toFixed(1)}A${name ? ` · ${name}` : ''}`
                  : `STANDBY${name ? ` · ${name}` : ''}`,
              });
              continue;
            }
          }

          // Any other firmware log line — surface as info
          onEventRef.current({ type: 'info', message: line });
        }
      }
    } catch (err) {
      onEventRef.current({ type: 'error', message: `Serial read error: ${(err as Error).message}` });
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
      await closed;
    }
  }, []);

  const openPort = useCallback(async (port: SerialPortLike) => {
    await port.open({ baudRate: 115200 });
    portRef.current = port;

    const info = port.getInfo?.() ?? {};
    const vendor = info.usbVendorId
      ? `VID:${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}`
      : 'Serial';
    setDeviceInfo({ name: 'PicoPD', port: vendor, pdVersion: 'PD3.1' });
    setStatus('connected');
    onEventRef.current({ type: 'success', message: 'Connected · PicoPD' });

    if (port.writable) {
      writerRef.current = port.writable.getWriter();
    }

    // Run the read loop. When it returns the port closed.
    void startReadLoop(port).then(async () => {
      await cleanupStreams();
      try { await port.close(); } catch { /* noop */ }
      portRef.current = null;
      setDeviceInfo(null);
      setFirmwareState(null);

      if (userClosedRef.current) {
        setStatus('disconnected');
        userClosedRef.current = false;
        return;
      }

      if (autoReconnectRef.current) {
        onEventRef.current({ type: 'warning', message: 'Port closed — reconnecting in 2s' });
        setStatus('connecting');
        setTimeout(() => {
          openPort(port).catch((err) => {
            onEventRef.current({ type: 'error', message: `Reconnect failed: ${(err as Error).message}` });
            setStatus('error');
          });
        }, 2000);
      } else {
        setStatus('disconnected');
      }
    });
  }, [cleanupStreams, startReadLoop]);

  const connect = useCallback(async () => {
    if (!supported) {
      onEventRef.current({ type: 'error', message: 'WebSerial not supported in this browser' });
      setStatus('error');
      return;
    }
    try {
      setStatus('connecting');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const port = await (navigator as any).serial.requestPort();
      userClosedRef.current = false;
      await openPort(port);
    } catch (err) {
      onEventRef.current({ type: 'error', message: `Connect failed: ${(err as Error).message}` });
      setStatus('error');
    }
  }, [openPort, supported]);

  const disconnect = useCallback(async () => {
    userClosedRef.current = true;
    await cleanupStreams();
    try { await portRef.current?.close(); } catch { /* noop */ }
    portRef.current = null;
    setDeviceInfo(null);
      setFirmwareState(null);
    setStatus('disconnected');
    onEventRef.current({ type: 'info', message: 'Disconnected' });
  }, [cleanupStreams]);

  const sendCommand = useCallback(async (cmd: string) => {
    const writer = writerRef.current;
    if (!writer) return;
    const encoder = new TextEncoder();
    await writer.write(encoder.encode(cmd.endsWith('\n') ? cmd : cmd + '\n'));
  }, []);

  // Best-effort cleanup on unmount
  useEffect(() => {
    return () => {
      userClosedRef.current = true;
      void cleanupStreams().then(async () => {
        try { await portRef.current?.close(); } catch { /* noop */ }
      });
    };
  }, [cleanupStreams]);

  return { supported, status, deviceInfo, firmwareState, connect, disconnect, sendCommand };
}
