import { useEffect, useSyncExternalStore } from "react";

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
type SerialSnapshot = {
  supported: boolean;
  status: Status;
  error: string | null;
  telemetry: Telemetry | null;
};

const serialState: Omit<SerialSnapshot, "supported"> = {
  status: "disconnected",
  error: null,
  telemetry: null,
};

const isSerialSupported = () => typeof navigator !== "undefined" && "serial" in navigator;

const serialSnapshot: SerialSnapshot = {
  supported: isSerialSupported(),
  status: isSerialSupported() ? serialState.status : "unsupported",
  error: serialState.error,
  telemetry: serialState.telemetry,
};

const listeners = new Set<() => void>();
export type HardwareButton = "UP" | "DOWN" | "ENTER";
const buttonListeners = new Set<(b: HardwareButton) => void>();
export const onHardwareButton = (cb: (b: HardwareButton) => void) => {
  buttonListeners.add(cb);
  return () => { buttonListeners.delete(cb); };
};

// Persistent connection refs
let port: any = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let writer: WritableStreamDefaultWriter<string> | null = null;
let readableStreamClosed: Promise<void> | null = null;
let writableStreamClosed: Promise<void> | null = null;

const emit = () => listeners.forEach((l) => l());

const setSerialState = (patch: Partial<typeof serialState>) => {
  let changed = false;
  (Object.keys(patch) as Array<keyof typeof serialState>).forEach((key) => {
    const nextValue = patch[key];
    if (serialState[key] !== nextValue) {
      serialState[key] = nextValue as never;
      changed = true;
    }
  });
  if (changed) {
    serialSnapshot.supported = isSerialSupported();
    serialSnapshot.status = isSerialSupported() ? serialState.status : "unsupported";
    serialSnapshot.error = serialState.error;
    serialSnapshot.telemetry = serialState.telemetry;
    emit();
  }
};

const getSnapshot = (): SerialSnapshot => serialSnapshot;

const normalizeTelemetry = (value: unknown): Telemetry | null => {
  if (!value || typeof value !== "object") return null;
  const telemetry = { ...(value as Record<string, unknown>) } as Telemetry;
  if (typeof telemetry.v !== "number" && typeof telemetry.voltage === "number") telemetry.v = telemetry.voltage;
  if (typeof telemetry.i !== "number" && typeof telemetry.current === "number") telemetry.i = telemetry.current;
  if (typeof telemetry.v === "number" && typeof telemetry.i === "number") {
    if (typeof telemetry.p !== "number") telemetry.p = +(telemetry.v * telemetry.i).toFixed(2);
    return telemetry;
  }
  if (
    telemetry.device ||
    telemetry.state ||
    telemetry.polarity ||
    telemetry.output != null ||
    telemetry.remote != null ||
    typeof telemetry.profile === "number"
  ) {
    return { v: 0, i: 0, p: 0, ...telemetry };
  }
  return null;
};

const handlePortDisconnect = () => {
  console.warn("Serial port disconnected.");
  void cleanupSerial("disconnected", "Serial port disconnected.");
};

async function cleanupSerial(nextStatus: Status = "disconnected", nextError: string | null = null) {
  // Cancel reader
  if (reader) {
    try { await reader.cancel(); } catch {}
    try { reader.releaseLock(); } catch {}
    reader = null;
  }
  if (readableStreamClosed) {
    try { await readableStreamClosed.catch(() => {}); } catch {}
    readableStreamClosed = null;
  }

  // Close writer
  if (writer) {
    try { await writer.close(); } catch {}
    try { writer.releaseLock(); } catch {}
    writer = null;
  }
  if (writableStreamClosed) {
    try { await writableStreamClosed.catch(() => {}); } catch {}
    writableStreamClosed = null;
  }

  if (port) {
    try { port.removeEventListener?.("disconnect", handlePortDisconnect); } catch {}
    try { await port.close(); } catch {}
    port = null;
  }

  setSerialState({ status: nextStatus, error: nextError, telemetry: null });
}

const isInsideIframe = () => {
  try { return typeof window !== "undefined" && window.self !== window.top; } catch { return true; }
};

async function connectSerial() {
  if (!isSerialSupported()) {
    setSerialState({ status: "unsupported", error: "Web Serial is not supported in this browser. Use Chrome/Edge on desktop." });
    return;
  }

  if (isInsideIframe()) {
    setSerialState({
      status: "error",
      error: "Web Serial is blocked inside the embedded Lovable preview. Open the app in a new tab (\"Open in new tab\" button) or use the published URL.",
    });
    return;
  }

  if (port) await cleanupSerial();

  try {
    setSerialState({ status: "connecting", error: null, telemetry: null });

    // 1. Request port (must be from user gesture)
    port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 115200 });
    port.addEventListener?.("disconnect", handlePortDisconnect);

    // 2. Decoder for inbound bytes -> text
    const textDecoder = new TextDecoderStream();
    readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
    reader = textDecoder.readable.getReader();

    // 3. Encoder for outbound text -> bytes (persistent writer)
    const textEncoder = new TextEncoderStream();
    writableStreamClosed = textEncoder.readable.pipeTo(port.writable);
    writer = textEncoder.writable.getWriter();

    console.log("Serial port opened successfully!");
    setSerialState({ status: "connected", error: null });

    // 4. Read loop (line-by-line)
    let serialBuffer = "";
    (async () => {
      try {
        while (true) {
          const { value, done } = await reader!.read();
          if (done) {
            try { reader?.releaseLock(); } catch {}
            break;
          }
          if (value) {
            serialBuffer += value;
            if (serialBuffer.includes("\n")) {
              const lines = serialBuffer.split("\n");
              serialBuffer = lines.pop() || "";
              for (const line of lines) {
                const cleanLine = line.trim();
                if (cleanLine.startsWith("{") && cleanLine.endsWith("}")) {
                  try {
                    const parsed = JSON.parse(cleanLine);
                    const normalized = normalizeTelemetry(parsed);
                    if (normalized) setSerialState({ telemetry: normalized, error: null });
                  } catch (e) {
                    console.error("Failed to parse JSON line:", cleanLine, e);
                  }
                }
              }
            }
          }
        }
      } catch (error: any) {
        console.error("Read loop error:", error);
        setSerialState({ error: error?.message ?? "Read loop error" });
      }
    })();
  } catch (error: any) {
    console.error("Serial connection failed:", error);
    await cleanupSerial("error", error?.message ?? "Failed to connect to the serial port.");
  }
}

async function sendHardwareCommand(payload: SerialCommand) {
  if (!writer) {
    console.error("Writer unavailable. Connect first!");
    setSerialState({ error: "The serial port is not open. Connect first!" });
    return;
  }
  try {
    const jsonString = JSON.stringify(payload) + "\n";
    await writer.write(jsonString);
    console.log("Command sent:", jsonString);
    setSerialState({ error: null });
  } catch (err: any) {
    console.error("Error sending data over Serial:", err);
    setSerialState({ error: err?.message ?? "Error sending data over Serial." });
  }
}

async function desconectarSerial() {
  await cleanupSerial();
}

export function useSerialTelemetry() {
  const snapshot = useSyncExternalStore(
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
        void cleanupSerial();
      }
    };
  }, []);

  return {
    supported: snapshot.supported,
    status: snapshot.status,
    error: snapshot.error,
    telemetry: snapshot.telemetry,
    connect: connectSerial,
    disconnect: desconectarSerial,
    send: sendHardwareCommand,
  };
}
