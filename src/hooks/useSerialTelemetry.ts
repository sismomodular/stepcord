import { useCallback, useEffect, useRef, useState } from "react";

export type Telemetry = {
  v: number;
  i: number;
  p?: number;
  mode?: "PD" | "PPS";
  profile?: number;
  device?: string;
  voltage?: number;
  current?: number;
  polarity?: string;
  state?: string;
  remote?: boolean;
  output?: 0 | 1 | boolean;
};

export type SerialCommand = Record<string, unknown>;

type Status = "unsupported" | "disconnected" | "connecting" | "connected" | "error";

export function useSerialTelemetry() {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const [status, setStatus] = useState<Status>(supported ? "disconnected" : "unsupported");
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    try { await readerRef.current?.cancel(); } catch {}
    try { readerRef.current?.releaseLock(); } catch {}
    try { await portRef.current?.close(); } catch {}
    readerRef.current = null;
    portRef.current = null;
    setStatus("disconnected");
  }, []);

  const connect = useCallback(async () => {
    if (!supported) return;
    setError(null);
    setStatus("connecting");
    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 115200 });
      portRef.current = port;

      const reader = port.readable.getReader();
      readerRef.current = reader;
      keepReadingRef.current = true;
      setStatus("connected");

      const decoder = new TextDecoder();
      let buf = "";
      (async () => {
        while (keepReadingRef.current) {
          try {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            buf += decoder.decode(value, { stream: true });
            let nl: number;
            while ((nl = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, nl).trim();
              buf = buf.slice(nl + 1);
              if (!line) continue;
              try {
                const obj = JSON.parse(line) as Telemetry;
                if (typeof obj.v !== "number" && typeof obj.voltage === "number") obj.v = obj.voltage;
                if (typeof obj.i !== "number" && typeof obj.current === "number") obj.i = obj.current;
                if (typeof obj.v === "number" && typeof obj.i === "number") {
                  if (typeof obj.p !== "number") obj.p = +(obj.v * obj.i).toFixed(2);
                  setTelemetry(obj);
                } else if (obj.device || obj.state || obj.polarity || obj.output != null || obj.remote != null) {
                  setTelemetry({ v: 0, i: 0, p: 0, ...obj });
                }
              } catch {
                // ignore non-JSON
              }
            }
          } catch (e: any) {
            setError(e?.message ?? "Read error");
            break;
          }
        }
        if (keepReadingRef.current) {
          keepReadingRef.current = false;
          void disconnect();
        }
      })();
    } catch (e: any) {
      setError(e?.message ?? "Failed to open serial port");
      setStatus("error");
      await disconnect();
    }
  }, [supported, disconnect]);

  const send = useCallback(async (payload: SerialCommand) => {
    const port = portRef.current;
    if (!port || !port.writable) {
      console.error("Porta Serial não está conectada ou não é gravável.");
      return;
    }
    const writer = port.writable.getWriter();
    try {
      const encoder = new TextEncoder();
      const jsonString = JSON.stringify(payload) + "\n";
      await writer.write(encoder.encode(jsonString));
      console.log("Comando enviado com sucesso para o PicoPD:", jsonString);
    } catch (err: any) {
      console.error("Erro ao escrever na porta Serial:", err);
      setError(err?.message ?? "Write error");
    } finally {
      writer.releaseLock();
    }
  }, []);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return { supported, status, error, telemetry, connect, disconnect, send };
}
