import { useEffect, useSyncExternalStore } from "react";

// ----------------------------------------------------------------------------
// Companion serial transport (JSON line-delimited @ 115200 baud).
//
// Pico → Host: one JSON object per line, e.g.
//   {"v":9.01,"i":0.42,"p":3.78,"mode":"FIXED","profile":"Volca Series",
//    "polarity":"center-positive","en":true,"err":""}
//
// Host → Pico: JSON commands followed by '\n'
//   {"output":"on"} | {"output":"off"} | {"select":"Volca Series"}
// ----------------------------------------------------------------------------

export type CompanionTelemetry = {
  v: number;
  i: number;
  p: number;
  mode?: string;
  profile?: string;
  polarity?: "center-positive" | "center-negative" | string;
  en?: boolean;
  err?: string;
  ts: number;
};

export type CompanionStatus = "unsupported" | "disconnected" | "connecting" | "connected" | "error";

type Snapshot = {
  supported: boolean;
  status: CompanionStatus;
  error: string | null;
  telemetry: CompanionTelemetry | null;
};

const isSerialSupported = () =>
  typeof navigator !== "undefined" && "serial" in navigator;

const isInsideIframe = () => {
  try {
    return typeof window !== "undefined" && window.self !== window.top;
  } catch {
    return true;
  }
};

const state: Omit<Snapshot, "supported"> = {
  status: "disconnected",
  error: null,
  telemetry: null,
};

const snapshot: Snapshot = {
  supported: isSerialSupported(),
  status: isSerialSupported() ? state.status : "unsupported",
  error: state.error,
  telemetry: state.telemetry,
};

const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

const telemetryListeners = new Set<(t: CompanionTelemetry) => void>();
export const onCompanionTelemetry = (cb: (t: CompanionTelemetry) => void) => {
  telemetryListeners.add(cb);
  return () => { telemetryListeners.delete(cb); };
};

const setState = (patch: Partial<typeof state>) => {
  let changed = false;
  (Object.keys(patch) as Array<keyof typeof state>).forEach((key) => {
    const next = patch[key];
    if (state[key] !== next) {
      state[key] = next as never;
      changed = true;
    }
  });
  if (changed) {
    snapshot.supported = isSerialSupported();
    snapshot.status = isSerialSupported() ? state.status : "unsupported";
    snapshot.error = state.error;
    snapshot.telemetry = state.telemetry;
    emit();
  }
};

const getSnapshot = (): Snapshot => snapshot;

type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  addEventListener?: (type: string, l: () => void) => void;
  removeEventListener?: (type: string, l: () => void) => void;
};
type NavigatorSerial = {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
};

let port: SerialPortLike | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let abortRead = false;
let readablePiped: Promise<void> | null = null;

const handleDisconnect = () => { void cleanup("disconnected", "PicoPD Pro disconnected."); };

async function cleanup(nextStatus: CompanionStatus = "disconnected", nextError: string | null = null) {
  abortRead = true;
  try { await reader?.cancel(); } catch {}
  try { reader?.releaseLock(); } catch {}
  reader = null;
  try { await writer?.close(); } catch {}
  try { writer?.releaseLock(); } catch {}
  writer = null;
  try { await readablePiped; } catch {}
  readablePiped = null;
  if (port) {
    try { port.removeEventListener?.("disconnect", handleDisconnect); } catch {}
    try { await port.close(); } catch {}
    port = null;
  }
  setState({ status: nextStatus, error: nextError, telemetry: null });
}

const handleLine = (raw: string) => {
  const line = raw.trim();
  if (!line || !line.startsWith("{")) return;
  try {
    const obj = JSON.parse(line);
    if (typeof obj?.v !== "number" && typeof obj?.i !== "number") return;
    const t: CompanionTelemetry = {
      v: Number(obj.v ?? 0),
      i: Number(obj.i ?? 0),
      p: Number(obj.p ?? (Number(obj.v ?? 0) * Number(obj.i ?? 0))),
      mode: typeof obj.mode === "string" ? obj.mode : undefined,
      profile: typeof obj.profile === "string" ? obj.profile : undefined,
      polarity: typeof obj.polarity === "string" ? obj.polarity : undefined,
      en: typeof obj.en === "boolean" ? obj.en : undefined,
      err: typeof obj.err === "string" ? obj.err : "",
      ts: Date.now(),
    };
    setState({ telemetry: t, error: null });
    telemetryListeners.forEach((cb) => { try { cb(t); } catch {} });
  } catch (e) {
    console.warn("Companion JSON parse failed:", line, e);
  }
};

async function readLoop(textStream: ReadableStream<string>) {
  reader = textStream.getReader();
  let buf = "";
  try {
    while (!abortRead) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += value;
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).replace(/\r$/, "");
        buf = buf.slice(nl + 1);
        handleLine(line);
      }
    }
  } catch (err) {
    if (!abortRead) setState({ error: err instanceof Error ? err.message : "Serial read error" });
  } finally {
    try { reader?.releaseLock(); } catch {}
    reader = null;
  }
}

async function connect() {
  if (!isSerialSupported()) {
    setState({ status: "unsupported", error: "Web Serial unsupported. Use Chrome/Edge desktop." });
    return;
  }
  if (isInsideIframe()) {
    setState({ status: "error", error: "Web Serial blocked inside preview iframe. Open in new tab." });
    return;
  }
  if (port) await cleanup();
  try {
    setState({ status: "connecting", error: null, telemetry: null });
    const nav = (navigator as unknown as { serial: NavigatorSerial }).serial;
    const picked = await nav.requestPort();
    await picked.open({ baudRate: 115200 });
    port = picked;
    abortRead = false;
    const dec = new TextDecoderStream();
    readablePiped = picked.readable!.pipeTo(dec.writable as unknown as WritableStream<Uint8Array>).catch(() => {});
    void readLoop(dec.readable);
    writer = picked.writable!.getWriter();
    try { picked.addEventListener?.("disconnect", handleDisconnect); } catch {}
    setState({ status: "connected", error: null });
  } catch (err) {
    const m = err instanceof Error ? err.message : "Failed to connect.";
    await cleanup("error", m);
  }
}

async function disconnect() { await cleanup(); }

async function sendCommand(cmd: Record<string, unknown>) {
  if (!port || !writer) {
    setState({ error: "Not connected. Click Connect first." });
    return;
  }
  try {
    const line = JSON.stringify(cmd) + "\n";
    await writer.write(new TextEncoder().encode(line));
    console.log("Companion sent:", line.trim());
    setState({ error: null });
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : "Send failed." });
  }
}

export function useCompanionSerial() {
  const snap = useSyncExternalStore(
    (l) => { listeners.add(l); return () => listeners.delete(l); },
    getSnapshot, getSnapshot,
  );
  useEffect(() => () => { if (listeners.size <= 1) void cleanup(); }, []);
  return {
    supported: snap.supported,
    status: snap.status,
    error: snap.error,
    telemetry: snap.telemetry,
    connect, disconnect,
    send: sendCommand,
    setOutput: (on: boolean) => sendCommand({ output: on ? "on" : "off" }),
    selectProfile: (name: string) => sendCommand({ select: name }),
  };
}
