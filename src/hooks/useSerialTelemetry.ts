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

let port: any = null;
let writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
let reader: ReadableStreamDefaultReader<string> | null = null;
let readableStreamClosed: Promise<void> | null = null;
let keepReading = false;
let readLoopPromise: Promise<void> | null = null;
let incomingBuffer = "";

const emit = () => {
  listeners.forEach((listener) => listener());
};

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

const parseIncomingChunk = (chunk: string) => {
  incomingBuffer += chunk;

  const lines = incomingBuffer.split(/\r?\n/);
  incomingBuffer = lines.pop() ?? "";

  const candidates = lines.map((line) => line.trim()).filter(Boolean);

  let closingBraceIndex = incomingBuffer.indexOf("}");
  while (closingBraceIndex >= 0) {
    const candidate = incomingBuffer.slice(0, closingBraceIndex + 1).trim();
    incomingBuffer = incomingBuffer.slice(closingBraceIndex + 1);
    const jsonStart = candidate.indexOf("{");
    if (jsonStart >= 0) candidates.push(candidate.slice(jsonStart));
    closingBraceIndex = incomingBuffer.indexOf("}");
  }

  candidates.forEach((candidate) => {
    try {
      const parsed = JSON.parse(candidate);
      const normalized = normalizeTelemetry(parsed);
      if (normalized) {
        setSerialState({ telemetry: normalized, error: null });
      }
    } catch {
      // Ignora mensagens que não são JSON válido.
    }
  });
};

const cleanupSerial = async (nextStatus: Status = "disconnected", nextError: string | null = null) => {
  keepReading = false;

  const activeReader = reader;
  reader = null;
  if (activeReader) {
    try {
      await activeReader.cancel();
    } catch {}
    try {
      activeReader.releaseLock();
    } catch {}
  }

  if (readableStreamClosed) {
    try {
      await readableStreamClosed;
    } catch {}
    readableStreamClosed = null;
  }

  if (writer) {
    try {
      writer.releaseLock();
    } catch {}
    writer = null;
  }

  if (port) {
    try {
      port.removeEventListener?.("disconnect", handlePortDisconnect);
    } catch {}
    try {
      await port.close();
    } catch {}
    port = null;
  }

  incomingBuffer = "";
  setSerialState({ status: nextStatus, error: nextError, telemetry: null });
};

async function inicializarLeitura() {
  while (port && port.readable && keepReading) {
    try {
      const textDecoder = new TextDecoderStream();
      readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      reader = textDecoder.readable.getReader();

      while (true) {
        const { value, done } = await reader.read();

        if (done) {
          try {
            reader.releaseLock();
          } catch {}
          reader = null;
          break;
        }

        if (value) {
          console.log("Dados vindos do PicoPD:", value);
          parseIncomingChunk(value);
        }
      }
    } catch (error: any) {
      console.error("Erro no loop de leitura:", error);
      setSerialState({ error: error?.message ?? "Erro no loop de leitura" });
      break;
    }
  }

  if (keepReading) {
    await cleanupSerial("disconnected", serialState.error);
  }
}

function handlePortDisconnect() {
  console.warn("Porta serial desconectada.");
  void cleanupSerial("disconnected", "Porta serial desconectada.");
}

async function conectarSerial() {
  if (!isSerialSupported()) {
    setSerialState({ status: "unsupported", error: "Web Serial não é suportado neste navegador." });
    return;
  }

  if (port || writer) {
    await cleanupSerial();
  }

  try {
    setSerialState({ status: "connecting", error: null, telemetry: null });

    port = await (navigator as any).serial.requestPort();
    port.addEventListener?.("disconnect", handlePortDisconnect);

    await port.open({ baudRate: 115200 });
    console.log("Porta Serial aberta com sucesso!");

    if (!port.writable) {
      throw new Error("Canal de escrita indisponível na porta serial.");
    }

    writer = port.writable.getWriter();
    keepReading = true;
    setSerialState({ status: "connected", error: null });

    if (!readLoopPromise) {
      readLoopPromise = inicializarLeitura().finally(() => {
        readLoopPromise = null;
      });
    }
  } catch (error: any) {
    console.error("Erro ao conectar à porta serial:", error);
    await cleanupSerial("error", error?.message ?? "Falha ao conectar à porta serial.");
  }
}

async function sendHardwareCommand(payload: SerialCommand) {
  if (!port || !writer) {
    console.error("Erro: Porta não conectada ou canal de escrita indisponível.");
    setSerialState({ error: "Porta não conectada ou canal de escrita indisponível." });
    return;
  }

  try {
    const encoder = new TextEncoder();
    const jsonString = JSON.stringify(payload) + "\n";

    await writer.write(encoder.encode(jsonString));
    console.log("Dado enviado com sucesso para o OLED:", jsonString);
    setSerialState({ error: null });
  } catch (err: any) {
    console.error("Erro crítico ao enviar dados:", err);
    setSerialState({ error: err?.message ?? "Erro crítico ao enviar dados." });
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
    connect: conectarSerial,
    disconnect: desconectarSerial,
    send: sendHardwareCommand,
  };
}
