import { useEffect, useSyncExternalStore } from "react";

// --- Minimal WebHID type shims (Chrome/Edge only) ---------------------------
type HIDDeviceFilter = { vendorId?: number; productId?: number; usagePage?: number; usage?: number };
type HIDInputReportEvent = Event & { device: HIDDevice; reportId: number; data: DataView };
type HIDConnectionEvent = Event & { device: HIDDevice };
type HIDDevice = EventTarget & {
  readonly opened: boolean;
  readonly productName: string;
  oninputreport: ((this: HIDDevice, ev: HIDInputReportEvent) => unknown) | null;
  open(): Promise<void>;
  close(): Promise<void>;
  sendReport(reportId: number, data: BufferSource): Promise<void>;
};
type HID = EventTarget & {
  requestDevice(options: { filters: HIDDeviceFilter[] }): Promise<HIDDevice[]>;
  getDevices(): Promise<HIDDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (ev: HIDConnectionEvent) => unknown): void;
  removeEventListener(type: "connect" | "disconnect", listener: (ev: HIDConnectionEvent) => unknown): void;
};

// ----------------------------------------------------------------------------
// WebHID transport for the PicoPD Pro.
// The hook name (`useSerialTelemetry`) and exported API are kept identical so
// the Dashboard does not need to change. Under the hood we now speak HID with
// fixed-size binary reports instead of newline-delimited JSON over Web Serial.
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

// --- HID protocol mapping ---------------------------------------------------
// Output report (host → device), 63 bytes (Report ID = 0):
//   byte 0 : stateId (0=SELECTING, 1=FINE_TUNING, 2=POLARITY_CHECK, 3=LOCKED)
//   byte 1 : voltage * 10  (e.g. 90 = 9.0V, 120 = 12.0V, 205 = 20.5V)
//   byte 2 : current * 10  (e.g. 30 = 3.0A)
//   byte 3 : output enable (0 = cut, 1 = deploy, 0xFF = unchanged)
//   byte 4 : polarity (0 = center +, 1 = center −)
//   byte 5 : profile index (0xFF = not provided)
//
// Input report (device → host), 64 bytes via `event.data` DataView:
//   byte 0 : stateId
//   byte 1 : voltage * 10
//   byte 2 : current * 10
//   byte 3 : button event (0 = none, 1 = UP, 2 = DOWN, 3 = ENTER)
//   byte 4 : remote/webModeActive flag (0/1)
//   byte 5 : profile index
// ----------------------------------------------------------------------------

const STATES = ["SELECTING", "FINE_TUNING", "POLARITY_CHECK", "LOCKED"] as const;
const stateToId = (s: unknown): number => {
  const idx = STATES.indexOf(String(s).toUpperCase() as (typeof STATES)[number]);
  return idx >= 0 ? idx : 0;
};
const polarityToByte = (p: unknown): number =>
  typeof p === "string" && p.toUpperCase().includes("INVERT") ? 1 : 0;

const isHidSupported = () => typeof navigator !== "undefined" && "hid" in navigator;

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
  supported: isHidSupported(),
  status: isHidSupported() ? state.status : "unsupported",
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
    snapshot.supported = isHidSupported();
    snapshot.status = isHidSupported() ? state.status : "unsupported";
    snapshot.error = state.error;
    snapshot.telemetry = state.telemetry;
    emit();
  }
};

const getSnapshot = (): Snapshot => snapshot;

// --- Persistent HID connection ---------------------------------------------
let device: HIDDevice | null = null;

const handleDisconnect = (event: HIDConnectionEvent) => {
  if (device && event.device === device) {
    console.warn("HID device disconnected.");
    void cleanup("disconnected", "PicoPD Pro disconnected.");
  }
};

async function cleanup(nextStatus: Status = "disconnected", nextError: string | null = null) {
  if (device) {
    try {
      device.oninputreport = null as unknown as HIDDevice["oninputreport"];
    } catch {}
    try {
      if (device.opened) await device.close();
    } catch {}
    device = null;
  }
  try {
    (navigator as unknown as { hid?: HID }).hid?.removeEventListener("disconnect", handleDisconnect);
  } catch {}
  setState({ status: nextStatus, error: nextError, telemetry: null });
}

const handleInputReport = (event: HIDInputReportEvent) => {
  const data = event.data; // DataView (Report ID byte stripped)
  if (!data || data.byteLength < 3) return;

  const stateId = data.getUint8(0);
  const voltage = data.getUint8(1) / 10;
  const current = data.getUint8(2) / 10;
  const buttonId = data.byteLength > 3 ? data.getUint8(3) : 0;
  const remote = data.byteLength > 4 ? data.getUint8(4) !== 0 : false;
  const profile = data.byteLength > 5 ? data.getUint8(5) : undefined;

  if (buttonId >= 1 && buttonId <= 3) {
    const b: HardwareButton = buttonId === 1 ? "UP" : buttonId === 2 ? "DOWN" : "ENTER";
    buttonListeners.forEach((cb) => {
      try {
        cb(b);
      } catch {}
    });
  }

  const telemetry: Telemetry = {
    v: voltage,
    i: current,
    p: +(voltage * current).toFixed(2),
    voltage,
    current,
    state: STATES[stateId] ?? "UNKNOWN",
    remote,
    ...(profile !== undefined && profile !== 0xff ? { profile } : {}),
  };
  setState({ telemetry, error: null });
};

async function connectHid() {
  if (!isHidSupported()) {
    setState({
      status: "unsupported",
      error: "WebHID is not supported in this browser. Use Chrome/Edge on desktop.",
    });
    return;
  }

  if (isInsideIframe()) {
    setState({
      status: "error",
      error:
        'WebHID is blocked inside the embedded Lovable preview. Open the app in a new tab ("Open in new tab" button) or use the published URL.',
    });
    return;
  }

  if (device) await cleanup();

  try {
    setState({ status: "connecting", error: null, telemetry: null });

    // Empty filters = let the user pick any HID device (PicoPD Pro).
    const devices = await (navigator as unknown as { hid: HID }).hid.requestDevice({ filters: [] });
    if (!devices.length) {
      setState({ status: "disconnected", error: "No device selected." });
      return;
    }

    const picked = devices[0];
    if (!picked.opened) await picked.open();

    device = picked;
    device.oninputreport = handleInputReport;
    (navigator as unknown as { hid: HID }).hid.addEventListener("disconnect", handleDisconnect);

    console.log("WebHID device opened:", device.productName);
    setState({ status: "connected", error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to connect via WebHID.";
    console.error("WebHID connection failed:", err);
    await cleanup("error", message);
  }
}

async function sendHardwareCommand(payload: SerialCommand) {
  if (!device || !device.opened) {
    console.error("HID device unavailable. Connect first!");
    setState({ error: "PicoPD Pro is not connected. Click Connect first!" });
    return;
  }
  try {
    const report = new Uint8Array(63);
    report.fill(0xff, 3); // unset markers

    if (typeof payload.state === "string") report[0] = stateToId(payload.state);
    else report[0] = 0;

    if (typeof payload.voltage === "number") {
      report[1] = Math.max(0, Math.min(255, Math.round(payload.voltage * 10)));
    } else {
      report[1] = 0;
    }

    if (typeof payload.current === "number") {
      report[2] = Math.max(0, Math.min(255, Math.round(payload.current * 10)));
    } else {
      report[2] = 0;
    }

    if (typeof payload.setOutput === "number") {
      report[3] = payload.setOutput ? 1 : 0;
    } else if (typeof payload.output === "number" || typeof payload.output === "boolean") {
      report[3] = payload.output ? 1 : 0;
    }

    if (typeof payload.polarity === "string") report[4] = polarityToByte(payload.polarity);
    if (typeof payload.profile === "number") report[5] = payload.profile & 0xff;

    await device.sendReport(0, report);
    console.log("HID report sent:", Array.from(report.slice(0, 6)));
    setState({ error: null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error sending HID report.";
    console.error("Error sending HID report:", err);
    setState({ error: message });
  }
}

async function disconnectHid() {
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
    connect: connectHid,
    disconnect: disconnectHid,
    send: sendHardwareCommand,
  };
}
