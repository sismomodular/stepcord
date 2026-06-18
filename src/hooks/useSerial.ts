import { useCallback, useEffect, useRef, useState } from 'react';
import { ConnectionStatus, DeviceInfo, TelemetryReading } from '../types/picopd';
import type { LogEvent } from '../components/dashboard/EventLog';

interface UseSerialOptions {
  autoReconnect: boolean;
  onReading: (r: TelemetryReading) => void;
  onEvent: (e: Omit<LogEvent, 'timestamp'>) => void;
}

interface UseSerialResult {
  supported: boolean;
  status: ConnectionStatus;
  deviceInfo: DeviceInfo | null;
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
          const line = buffer.slice(0, nl).trim();
          buffer = buffer.slice(nl + 1);
          if (!line) continue;
          try {
            const obj = JSON.parse(line) as { v?: number; i?: number; msg?: string };
            if (typeof obj.v === 'number' && typeof obj.i === 'number') {
              const reading: TelemetryReading = {
                voltage: obj.v,
                current: obj.i,
                power: parseFloat((obj.v * obj.i).toFixed(2)),
                timestamp: Date.now(),
              };
              onReadingRef.current(reading);
            }
            if (obj.msg) {
              onEventRef.current({ type: 'info', message: obj.msg });
            }
          } catch {
            // ignore non-JSON lines
          }
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

  return { supported, status, deviceInfo, connect, disconnect, sendCommand };
}
