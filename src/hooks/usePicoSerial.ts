import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionStatus, DeviceInfo, TelemetryReading } from '../types/picopd';
import type { LogEvent } from '../components/dashboard/EventLog';

// ----------------------------------------------------------------------------
// Unified PicoPD serial transport — JSON line-delimited @ 115200 baud.
// This is the ONLY protocol the firmware (firmware/picopd_bridge) understands.
//
// Pico → Host (one JSON object per line):
//   {"v":9.01,"i":0.42,"p":3.78,"mode":"FIXED","profile":"Volca Series",
//    "polarity":"center-positive","en":true,"err":""}
//
// Host → Pico (JSON + '\n'):
//   {"select":"Volca Series"}
//   {"set":"pps","v":12.0,"i":2.0}   |  {"set":"fixed","v":9.0,"i":1.0}
//   {"output":"on"} | {"output":"off"}
// ----------------------------------------------------------------------------

export interface PicoTelemetry {
  v: number;
  i: number;
  p: number;
  mode: 'PPS' | 'FIXED';
  profile: string;
  polarity: 'center-positive' | 'center-negative' | null;
  en: boolean;
  err: string;
}

export type ParsedLine =
  | { kind: 'telemetry'; telemetry: PicoTelemetry }
  | { kind: 'encoder'; dir: 'CW' | 'CCW' }
  | { kind: 'log'; message: string };

/**
 * Pure parser for a single line coming from the firmware.
 * Exported for unit testing — must never throw.
 */
export function parsePicoLine(raw: string): ParsedLine | null {
  const line = raw.trim().replace(/\r$/, '');
  if (!line) return null;

  // Plain-text encoder notification: "ENC:CW" / "ENC:CCW"
  if (line.startsWith('ENC:')) {
    return { kind: 'encoder', dir: line.slice(4).toUpperCase() === 'CCW' ? 'CCW' : 'CW' };
  }

  if (!line.startsWith('{')) return { kind: 'log', message: line };

  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(line) as Record<string, unknown>;
  } catch {
    return { kind: 'log', message: line };
  }

  // JSON encoder event: {"enc":"CW"}
  if (typeof obj.enc === 'string') {
    return { kind: 'encoder', dir: obj.enc.toUpperCase() === 'CCW' ? 'CCW' : 'CW' };
  }

  const hasV = typeof obj.v === 'number';
  const hasI = typeof obj.i === 'number';
  if (!hasV && !hasI) return { kind: 'log', message: line };

  const v = hasV ? (obj.v as number) : 0;
  const i = hasI ? (obj.i as number) : 0;
  const p = typeof obj.p === 'number' ? obj.p : v * i;
  const polarity =
    obj.polarity === 'center-positive' || obj.polarity === 'center-negative'
      ? obj.polarity
      : null;

  return {
    kind: 'telemetry',
    telemetry: {
      v,
      i,
      p,
      mode: obj.mode === 'PPS' ? 'PPS' : 'FIXED',
      profile: typeof obj.profile === 'string' ? obj.profile : '',
      polarity,
      en: obj.en === true,
      err: typeof obj.err === 'string' ? obj.err : '',
    },
  };
}

export interface FirmwareState {
  /** 0 = STANDBY (output off), 3 = LIVE (output on) */
  state: 0 | 3;
  targetVoltage: number;
  targetCurrent: number;
  name: string;
  isWebMode: boolean;
  mode: 'PPS' | 'FIXED';
  polarity: 'center-positive' | 'center-negative' | null;
  timestamp: number;
}

export type PicoCommand =
  | { select: string }
  | { set: 'pps' | 'fixed'; v: number; i: number }
  | { output: 'on' | 'off' };

interface UsePicoSerialOptions {
  autoReconnect: boolean;
  onReading: (r: TelemetryReading) => void;
  onEvent: (e: Omit<LogEvent, 'timestamp'>) => void;
  onEncoder?: (dir: 'CW' | 'CCW') => void;
}

interface UsePicoSerialResult {
  supported: boolean;
  status: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
  firmwareState: FirmwareState | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  /** Sends a JSON command line to the firmware. Returns false when not connected. */
  send: (cmd: PicoCommand) => Promise<boolean>;
}

type SerialPortLike = {
  open: (opts: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?: () => { usbVendorId?: number; usbProductId?: number };
};

export function usePicoSerial({
  autoReconnect,
  onReading,
  onEvent,
  onEncoder,
}: UsePicoSerialOptions): UsePicoSerialResult {
  const supported = typeof navigator !== 'undefined' && 'serial' in navigator;

  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);
  const [firmwareState, setFirmwareState] = useState<FirmwareState | null>(null);

  const portRef = useRef<SerialPortLike | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<string> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const userClosedRef = useRef(false);
  const lastErrRef = useRef<string>('');
  const autoReconnectRef = useRef(autoReconnect);
  useEffect(() => { autoReconnectRef.current = autoReconnect; }, [autoReconnect]);

  const onReadingRef = useRef(onReading);
  const onEventRef = useRef(onEvent);
  const onEncoderRef = useRef(onEncoder);
  useEffect(() => { onReadingRef.current = onReading; }, [onReading]);
  useEffect(() => { onEventRef.current = onEvent; }, [onEvent]);
  useEffect(() => { onEncoderRef.current = onEncoder; }, [onEncoder]);

  const cleanupStreams = useCallback(async () => {
    try { await readerRef.current?.cancel(); } catch { /* noop */ }
    try { readerRef.current?.releaseLock(); } catch { /* noop */ }
    readerRef.current = null;
    try { await writerRef.current?.close(); } catch { /* noop */ }
    try { writerRef.current?.releaseLock(); } catch { /* noop */ }
    writerRef.current = null;
  }, []);

  const handleParsed = useCallback((parsed: ParsedLine) => {
    if (parsed.kind === 'encoder') {
      onEncoderRef.current?.(parsed.dir);
      onEventRef.current({
        type: 'info',
        message: `Encoder ${parsed.dir === 'CW' ? 'clockwise' : 'counter-clockwise'}`,
      });
      return;
    }
    if (parsed.kind === 'log') {
      onEventRef.current({ type: 'info', message: parsed.message });
      return;
    }

    const t = parsed.telemetry;
    const fwState: 0 | 3 = t.en ? 3 : 0;
    const name = t.profile || 'MANUAL CONTROL';

    setFirmwareState({
      state: fwState,
      targetVoltage: t.v,
      targetCurrent: t.i,
      name,
      isWebMode: name !== 'MANUAL CONTROL' && name !== 'MANUAL VOLTAGE' && name !== 'Manual',
      mode: t.mode,
      polarity: t.polarity,
      timestamp: Date.now(),
    });

    onReadingRef.current({
      voltage: t.v,
      current: t.i,
      power: parseFloat(t.p.toFixed(2)),
      timestamp: Date.now(),
    });

    if (t.err && t.err !== lastErrRef.current) {
      onEventRef.current({ type: 'error', message: `Firmware: ${t.err}` });
    }
    lastErrRef.current = t.err;
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
          const line = buffer.slice(0, nl);
          buffer = buffer.slice(nl + 1);
          const parsed = parsePicoLine(line);
          if (parsed) handleParsed(parsed);
        }
      }
    } catch (err) {
      onEventRef.current({ type: 'error', message: `Serial read error: ${(err as Error).message}` });
    } finally {
      try { reader.releaseLock(); } catch { /* noop */ }
      await closed;
    }
  }, [handleParsed]);

  const openPort = useCallback(async (port: SerialPortLike) => {
    await port.open({ baudRate: 115200 });
    portRef.current = port;

    const info = port.getInfo?.() ?? {};
    const vendor = info.usbVendorId
      ? `VID:${info.usbVendorId.toString(16).toUpperCase().padStart(4, '0')}`
      : 'Serial';
    setDeviceInfo({ name: 'PicoPD', port: vendor, pdVersion: 'PD3.1' });
    setStatus('connected');
    onEventRef.current({ type: 'success', message: 'Connected · PicoPD (JSON protocol)' });

    if (port.writable) writerRef.current = port.writable.getWriter();

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

  const send = useCallback(async (cmd: PicoCommand): Promise<boolean> => {
    const writer = writerRef.current;
    if (!writer) return false;
    await writer.write(new TextEncoder().encode(JSON.stringify(cmd) + '\n'));
    return true;
  }, []);

  useEffect(() => {
    return () => {
      userClosedRef.current = true;
      void cleanupStreams().then(async () => {
        try { await portRef.current?.close(); } catch { /* noop */ }
      });
    };
  }, [cleanupStreams]);

  return { supported, status, deviceInfo, firmwareState, connect, disconnect, send };
}
