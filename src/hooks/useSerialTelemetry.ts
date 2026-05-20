import { useEffect, useSyncExternalStore } from "react";

// ----------------------------------------------------------------------------
// Web Serial transport for the PicoPD Pro.
//
// Wire protocol
// -------------
// Host  → Pico : single CSV line per command, newline terminated:
//                  "<stateId>,<voltageInt>,<current1dp>\n"   e.g. "3,9,3.0\n"
//                stateId: 0=SELECTING, 1=FINE_TUNING, 2=POLARITY_CHECK, 3=LOCKED
//                voltage : integer volts (rounded)
//                current : amps, 1 decimal place
//
// Pico → Host : newline-delimited lines, any of:
//                  "ENC:CW"       → encoder rotated clockwise  → DOWN
//                  "ENC:CCW"      → encoder rotated counter-CW → UP
//                  "BTN:ENTER"    → push button pressed
//                  "ST:<id>,<v>,<i>"  → hardware status echo (id 3 = LOCKED/active)
//                  '{"button":"UP|DOWN|ENTER"}'   (legacy JSON)
//                  '{...telemetry json...}'       (optional live telemetry)
// ----------------------------------------------------------------------------

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
type Snapshot = {
  supported: boolean;
  status: Status;
  error: string | null;
  telemetry: Telemetry | null;
};

const STATES = ["SELECTING", "FINE_TUNING", "POLARITY_CHECK", "LOCKED"] as const;
const stateToId = (s: unknown): number => {
  const idx = STATES.indexOf(String(s).toUpperCase() as (typeof STATES)[number]);
  return idx >= 0 ? idx : 0;
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

export type HardwareButton = "UP" | "DOWN" | "ENTER";
const buttonListeners = new Set<(b: HardwareButton) => void>();
export const onHardwareButton = (cb: (b: HardwareButton) => void) => {
  buttonListeners.add(cb);
  return () => {
    buttonListeners.delete(cb);
  };
};

const fireButton = (b: HardwareButton) => {
  buttonListeners.forEach((cb) => {
    try {
      cb(b);
    } catch {}
  });
};

const setState = (patch: Partial<typeof state>) => {
  let changed = false;
  (Object.keys(patch) as Array<keyof typeof state>).forEach((key) => {
    const nextValue = patch[key];
    if (state[key] !== nextValue) {
      state[key] = nextValue as never;
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

// --- Persistent Web Serial connection ---------------------------------------
type SerialPortLike = {
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
};
type NavigatorSerial = {
  requestPort(): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
  addEventListener?: (type: string, listener: () => void) => void;
};

let port: SerialPortLike | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let readableClosed: Promise<void> | null = null;
let writableClosed: Promise<void> | null = null;
let abortRead = false;

const handlePortDisconnect = () => {
  console.warn("Serial port disconnected.");
  void cleanup("disconnected", "PicoPD Pro disconnected.");
};

async function cleanup(nextStatus: Status = "disconnected", nextError: string | null = null) {
  abortRead = true;
  try {
    await reader?.cancel();
  } catch {}
  try {
    reader?.releaseLock();
  } catch {}
  reader = null;
  try {
    await writer?.close();
  } catch {}
  try {
    writer?.releaseLock();
  } catch {}
  writer = null;
  try {
    await readableClosed;
  } catch {}
  try {
    await writableClosed;
  } catch {}
  readableClosed = null;
  writableClosed = null;
  if (port) {
    try {
      port.removeEventListener?.("disconnect", handlePortDisconnect);
    } catch {}
    try {
      await port.close();
    } catch {}
    port = null;
  }
  setState({ status: nextStatus, error: nextError, telemetry: null });
}

const handleLine = (raw: string) => {
  const line = raw.trim();
  if (!line) return;

  // Encoder rotation: CW → DOWN, CCW → UP (per user mapping)
  if (line.startsWith("ENC:")) {
    const dir = line.slice(4).toUpperCase();
    if (dir === "CW") fireButton("DOWN");
    else if (dir === "CCW") fireButton("UP");
    return;
  }

  // Button: "BTN:ENTER" / "BTN:UP" / "BTN:DOWN"
  if (line.startsWith("BTN:")) {
    const k = line.slice(4).toUpperCase();
    if (k === "UP" || k === "DOWN" || k === "ENTER") fireButton(k);
    return;
  }

  // Hardware status echo: "ST:<stateId>,<voltage>,<current>"
  if (line.startsWith("ST:")) {
    const body = line.slice(3);
    const parts = body.split(",");
    const sid = parseInt(parts[0], 10);
    const v = Number(parts[1]);
    const i = Number(parts[2]);
    const stateName = Number.isFinite(sid) && sid >= 0 && sid < STATES.length ? STATES[sid] : undefined;
    setState({
      telemetry: {
        v: Number.isFinite(v) ? v : 0,
        i: Number.isFinite(i) ? i : 0,
        p: Number.isFinite(v) && Number.isFinite(i) ? +(v * i).toFixed(2) : 0,
        voltage: Number.isFinite(v) ? v : 0,
        current: Number.isFinite(i) ? i : 0,
        state: stateName,
        remote: sid === 3,
      },
      error: null,
    });
    return;
  }

  // JSON: button event or telemetry
  if (line.startsWith("{")) {
    try {
      const obj = JSON.parse(line);
      if (typeof obj?.button === "string") {
        const k = obj.button.toUpperCase();
        if (k === "UP" || k === "DOWN" || k === "ENTER") fireButton(k as HardwareButton);
        return;
      }
      // Optional telemetry frame
      const voltage = Number(obj.voltage ?? obj.v);
      const current = Number(obj.current ?? obj.i);
      if (Number.isFinite(voltage) || Number.isFinite(current)) {
        const v = Number.isFinite(voltage) ? voltage : 0;
        const i = Number.isFinite(current) ? current : 0;
        setState({
          telemetry: {
            v,
            i,
            p: +(v * i).toFixed(2),
            voltage: v,
            current: i,
            state: typeof obj.state === "string" ? obj.state : undefined,
            remote: obj.remote === true || obj.remote === 1,
          },
          error: null,
        });
      }
    } catch (e) {
      console.warn("Failed to parse JSON line:", line, e);
    }
    return;
  }
};

async function readLoop(textStream: ReadableStream<string>) {
  reader = textStream.getReader();
  let buffer = "";
  try {
    while (!abortRead) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).replace(/\r$/, "");
        buffer = buffer.slice(nl + 1);
        handleLine(line);
      }
    }
  } catch (err) {
    if (!abortRead) {
      console.error("Serial read error:", err);
      setState({ error: err instanceof Error ? err.message : "Serial read error" });
    }
  } finally {
    try {
      reader?.releaseLock();
    } catch {}
    reader = null;
  }
}

async function connectSerial() {
  if (!isSerialSupported()) {
    setState({
      status: "unsupported",
      error: "Web Serial is not supported in this browser. Use Chrome/Edge on desktop.",
    });
    return;
  }

  if (isInsideIframe()) {
    setState({
      status: "error",
      error:
        'Web Serial is blocked inside the embedded Lovable preview. Open the app in a new tab ("Open in new tab" button) or use the published URL.',
    });
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

    // Decode incoming bytes as UTF-8 text stream.
    const textDecoder = new TextDecoderStream();
    readableClosed = picked.readable!.pipeTo(textDecoder.writable as unknown as WritableStream<Uint8Array>).catch(() => {});
    void readLoop(textDecoder.readable);

    // Writer for outbound CSV commands.
    writer = picked.writable!.getWriter();

    try {
      picked.addEventListener?.("disconnect", handlePortDisconnect);
    } catch {}

    console.log("Serial port opened @115200");
    setState({ status: "connected", error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect to the serial port.";
    console.error("Serial connection failed:", err);
    await cleanup("error", message);
  }
}

async function sendHardwareCommand(payload: SerialCommand) {
  if (!port || !writer) {
    console.error("Serial port unavailable. Connect first!");
    setState({ error: "PicoPD Pro is not connected. Click Connect first!" });
    return;
  }
  try {
    const stateId = stateToId(payload.state);
    const voltage = Number(payload.voltage ?? 0);
    const current = Number(payload.current ?? 0);
    const line = `${stateId},${voltage.toFixed(2)},${current.toFixed(2)}\n`;
    await writer.write(new TextEncoder().encode(line));
    console.log("Serial sent:", line.trim());
    setState({ error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error sending over serial.";
    console.error("Serial write failed:", err);
    setState({ error: message });
  }
}

async function disconnectSerial() {
  await cleanup();
}

export function useSerialTelemetry() {
  const snap = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getSnapshot,
    getSnapshot,
  );

  useEffect(() => {
    return () => {
      if (listeners.size <= 1) {
        void cleanup();
      }
    };
  }, []);

  return {
    supported: snap.supported,
    status: snap.status,
    error: snap.error,
    telemetry: snap.telemetry,
    connect: connectSerial,
    disconnect: disconnectSerial,
    send: sendHardwareCommand,
  };
}
