import { useCallback, useEffect, useRef, useState } from "react";

/**
 * WebSerial telemetry hook for PicoPD.
 *
 * Wire protocol (line-delimited JSON, \n terminated, 115200 8N1):
 *
 *   Device -> Host (telemetry, push at ~10 Hz):
 *     {"v":9.01,"i":1.42,"p":12.79,"mode":"PPS","profile":1}
 *
 *   Host -> Device (commands):
 *     {"cmd":"setMode","mode":"PD"|"PPS"}
 *     {"cmd":"setVoltage","v":9.00}        // PPS only, volts
 *     {"cmd":"setProfile","idx":0..4}      // Fixed PD PDO index
 *
 * Reference firmware sketch (RP2040 / Arduino, AP33772S over I2C):
 *
 *   #include <Wire.h>
 *   void setup() {
 *     Serial.begin(115200);
 *     Wire.begin();        // SDA/SCL on default pins
 *   }
 *   void loop() {
 *     // TODO: read VOLTAGE / CURRENT registers from AP33772S @ 0x52
 *     float v = readVoltage();
 *     float i = readCurrent();
 *     Serial.printf("{\"v\":%.2f,\"i\":%.2f,\"p\":%.2f,\"mode\":\"PPS\",\"profile\":1}\n",
 *                   v, i, v * i);
 *     // parse incoming JSON commands on Serial and reprogram AP33772S
 *     delay(100);
 *   }
 */

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

export type SerialCommand =
  | { cmd: "setMode"; mode: "PD" | "PPS" }
  | { cmd: "setVoltage"; v: number }
  | { cmd: "setProfile"; idx: number }
  | Record<string, unknown>;

type Status = "unsupported" | "disconnected" | "connecting" | "connected" | "error";

export function useSerialTelemetry() {
  const supported = typeof navigator !== "undefined" && "serial" in navigator;
  const [status, setStatus] = useState<Status>(supported ? "disconnected" : "unsupported");
  const [error, setError] = useState<string | null>(null);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);

  const portRef = useRef<any>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const writerRef = useRef<WritableStreamDefaultWriter<Uint8Array> | null>(null);
  const keepReadingRef = useRef(false);

  const disconnect = useCallback(async () => {
    keepReadingRef.current = false;
    try {
      await readerRef.current?.cancel();
    } catch {}
    try {
      readerRef.current?.releaseLock();
    } catch {}
    try {
      await writerRef.current?.close();
    } catch {}
    try {
      writerRef.current?.releaseLock();
    } catch {}
    try {
      await portRef.current?.close();
    } catch {}
    readerRef.current = null;
    writerRef.current = null;
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

      const writer = port.writable.getWriter();
      writerRef.current = writer;

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
                // ignore non-JSON / partial frames
              }
            }
          } catch (e: any) {
            setError(e?.message ?? "Read error");
            break;
          }
        }
        // Reader loop ended (cable unplugged or cancelled) — clean up state.
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

  const send = useCallback(async (cmd: SerialCommand) => {
    const w = writerRef.current;
    if (!w) return;

    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(cmd) + "\n";

    try {
      console.log("Enviado para o hardware:", jsonString);
      await w.write(encoder.encode(jsonString));
    } catch (e: any) {
      setError(e?.message ?? "Write error");
    }
  }, []);

  useEffect(() => () => { void disconnect(); }, [disconnect]);

  return { supported, status, error, telemetry, connect, disconnect, send };
}
