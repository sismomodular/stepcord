import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Cable, CheckCircle2, Power, Zap, SlidersHorizontal, ShieldAlert, Radio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useSerialTelemetry, onHardwareButton } from "@/hooks/useSerialTelemetry";
import {
  DEVICES,
  MANUAL_IDX,
  MANUAL_MIN_V,
  MANUAL_MAX_V,
  MANUAL_STEP_V,
} from "@/data/devices";
import myVoltsLogo from "@/assets/myvolts-logo.png";

type DeviceState = "SELECTING" | "FINE_TUNING" | "LOCKED" | "DISCONNECTED";

const Dashboard = () => {
  const { supported, status, error, telemetry, connect, disconnect, send } = useSerialTelemetry();
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [manualV, setManualV] = useState<number>(5.0);
  const [armed, setArmed] = useState<boolean>(false);

  type HistoryProfile = { id: number; name: string; voltage: number; current: number };
  const HISTORY_KEY = "stepcord:history:v1";
  const [historyProfiles, setHistoryProfiles] = useState<HistoryProfile[]>(() => {
    try {
      const raw = typeof localStorage !== "undefined" ? localStorage.getItem(HISTORY_KEY) : null;
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 5) : [];
    } catch {
      return [];
    }
  });

  const pushHistory = useCallback((p: HistoryProfile) => {
    setHistoryProfiles((prev) => {
      const filtered = prev.filter((x) => !(x.name === p.name && x.voltage === p.voltage));
      const next = [p, ...filtered].slice(0, 5);
      try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  useEffect(() => {
    const html = document.documentElement;
    const had = html.classList.contains("dark");
    html.classList.add("dark");
    return () => { if (!had) html.classList.remove("dark"); };
  }, []);

  const connected = status === "connected";
  const isManual = selectedIdx === MANUAL_IDX;
  const profileConfirmed = selectedIdx !== null;

  // Derive the canonical UI state — the React app is now the source of truth.
  const deviceState: DeviceState = !connected
    ? "DISCONNECTED"
    : armed
    ? "LOCKED"
    : isManual
    ? "FINE_TUNING"
    : "SELECTING";

  const isLocked = deviceState === "LOCKED";
  const isFineTuning = deviceState === "FINE_TUNING";
  const isSelecting = deviceState === "SELECTING";

  // Build the unified payload from local state.
  const buildPayload = useCallback((stateOverride?: DeviceState, idxOverride?: number | null, vOverride?: number) => {
    const idx = idxOverride ?? selectedIdx;
    if (idx == null) return null;
    const d = DEVICES[idx];
    const manual = idx === MANUAL_IDX;
    const volt = manual ? (vOverride ?? manualV) : d.voltage;
    const state = stateOverride ?? deviceState;
    const protocol = manual || state === "FINE_TUNING" ? "[PPS]" : "[PD]";
    return {
      device: String(d.name).slice(0, 16),
      voltage: Number(volt.toFixed(2)),
      current: Number(d.current.toFixed(2)),
      polarity: d.polarityLabel,
      protocol,
      state,
    };
  }, [selectedIdx, manualV, deviceState]);

  const sendSync = useCallback((stateOverride?: DeviceState, idxOverride?: number | null, vOverride?: number) => {
    if (!connected) return;
    const payload = buildPayload(stateOverride, idxOverride, vOverride);
    if (payload) void send(payload);
  }, [connected, buildPayload, send]);

  const pickProfile = useCallback((idx: number) => {
    if (isLocked) return;
    setSelectedIdx(idx);
    const nextState: DeviceState = idx === MANUAL_IDX ? "FINE_TUNING" : "SELECTING";
    sendSync(nextState, idx);
  }, [isLocked, sendSync]);

  const onManualVoltChange = useCallback((v: number) => {
    const clamped = Math.min(MANUAL_MAX_V, Math.max(MANUAL_MIN_V, Math.round(v * 10) / 10));
    setManualV(clamped);
    if (isManual && !isLocked) sendSync("FINE_TUNING", MANUAL_IDX, clamped);
  }, [isManual, isLocked, sendSync]);

  const togglePower = useCallback(() => {
    if (!connected || !profileConfirmed) return;
    const next = !armed;
    setArmed(next);
    const nextState: DeviceState = next ? "LOCKED" : (isManual ? "FINE_TUNING" : "SELECTING");
    sendSync(nextState);
  }, [connected, profileConfirmed, armed, isManual, sendSync]);

  // Listen for physical button events from hardware.
  const selectedRef = useRef(selectedIdx);
  const armedRef = useRef(armed);
  useEffect(() => { selectedRef.current = selectedIdx; }, [selectedIdx]);
  useEffect(() => { armedRef.current = armed; }, [armed]);

  useEffect(() => {
    return onHardwareButton((b) => {
      if (b === "ENTER") { togglePower(); return; }
      if (armedRef.current) return; // ignore navigation when locked
      const cur = selectedRef.current ?? -1;
      const len = DEVICES.length;
      const next = b === "UP" ? (cur <= 0 ? len - 1 : cur - 1) : (cur + 1) % len;
      pickProfile(next);
    });
  }, [togglePower, pickProfile]);

  // On (re)connect, push the current state once so hardware OLED matches the UI.
  useEffect(() => {
    if (connected && selectedIdx != null) sendSync();
  }, [connected]); // eslint-disable-line react-hooks/exhaustive-deps

  const deviceName = selectedIdx != null ? DEVICES[selectedIdx].name : "—";
  const voltage = isManual ? manualV : selectedIdx != null ? DEVICES[selectedIdx].voltage : 0;
  const current = selectedIdx != null ? DEVICES[selectedIdx].current : 0;
  const polarity = selectedIdx != null ? DEVICES[selectedIdx].polarityLabel : "—";
  const remote = telemetry?.remote ?? false;

  const protocolBadge = useMemo(() => (isFineTuning || isManual ? "[PPS]" : "[PD]"), [isFineTuning, isManual]);

  const headerStatus = useMemo(() => {
    if (deviceState === "LOCKED") return { text: "POWER OUTPUT: ACTIVE", tone: "locked" as const };
    if (deviceState === "FINE_TUNING") return { text: "MODE: MANUAL SETUP", tone: "tuning" as const };
    if (deviceState === "SELECTING") return { text: "MODE: PROFILE SELECT", tone: "select" as const };
    return { text: "DISCONNECTED", tone: "off" as const };
  }, [deviceState]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10 space-y-6">
        {/* Header */}
        <header className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <a href="https://myvolts.com" target="_blank" rel="noreferrer">
              <img src={myVoltsLogo} alt="myVolts" className="h-9 w-auto object-contain invert brightness-0" />
            </a>
            <div className="hidden sm:block">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">StepCord Dashboard</div>
              <div className="text-sm font-semibold">USB-C PD / PPS Controller</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-[10px] font-bold tracking-[0.2em] text-muted-foreground">
              <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-success animate-pulse-dot" : "bg-muted-foreground"}`} />
              {connected ? "LINKED" : status.toUpperCase()}
            </div>
            {connected ? (
              <Button onClick={() => void disconnect()} className="hw-btn gap-2 rounded-full">
                <Cable className="h-4 w-4" /> Disconnect
              </Button>
            ) : (
              <Button
                onClick={() => void connect()}
                disabled={!supported || status === "connecting"}
                className="hw-btn-primary gap-2 rounded-full px-5 font-bold"
              >
                <Cable className="h-4 w-4" />
                {status === "connecting" ? "Connecting…" : "Connect StepCord"}
              </Button>
            )}
          </div>
        </header>

        {(() => {
          let inIframe = false;
          try { inIframe = typeof window !== "undefined" && window.self !== window.top; } catch { inIframe = true; }
          if (!inIframe) return null;
          return (
            <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong>Web Serial is blocked inside the embedded preview.</strong> Open in a new tab to connect to the PicoPD Pro.
              </span>
              <Button
                onClick={() => window.open(window.location.href, "_blank", "noopener,noreferrer")}
                className="hw-btn-primary gap-2 rounded-full px-4"
              >
                Open in new tab
              </Button>
            </div>
          );
        })()}

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}

        {/* OLED-style status header */}
        <section
          className={`panel relative overflow-hidden p-5 md:p-6 ${
            headerStatus.tone === "locked"
              ? "border-destructive/60 bg-destructive/10"
              : headerStatus.tone === "tuning"
              ? "border-primary/50 bg-primary/5"
              : ""
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              {headerStatus.tone === "locked" ? (
                <ShieldAlert className="h-5 w-5 text-destructive" />
              ) : headerStatus.tone === "tuning" ? (
                <SlidersHorizontal className="h-5 w-5 text-primary" />
              ) : (
                <Radio className="h-5 w-5 text-muted-foreground" />
              )}
              <div
                className={`font-mono-tech text-xl font-extrabold tracking-wider md:text-2xl ${
                  headerStatus.tone === "locked" ? "text-destructive" : "text-foreground"
                }`}
              >
                {headerStatus.text}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-mono-tech rounded-md border border-border bg-muted/40 px-2 py-1 text-xs font-bold tracking-wider text-foreground">
                {protocolBadge}
              </span>
              {remote && (
                <span className="font-mono-tech rounded-md border border-primary/50 bg-primary/10 px-2 py-1 text-xs font-bold tracking-wider text-primary">
                  REMOTE
                </span>
              )}
            </div>
          </div>

          {isSelecting && !profileConfirmed && (
            <div className="mt-4 flex items-center justify-center">
              <div className="font-mono-tech animate-pulse text-2xl font-extrabold tracking-[0.18em] text-warning md:text-3xl">
                !! PRESS TO ARM !!
              </div>
            </div>
          )}
        </section>

        {/* Telemetry */}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Device" value={deviceName} mono={false} />
          <StatCard label="Voltage" value={`${Number(voltage).toFixed(2)} V`} accent />
          <StatCard label="Current" value={`${Number(current).toFixed(2)} A`} accent />
          <StatCard label="Polarity" value={polarity} small />
        </section>

        {/* Big power action */}
        <section className="panel p-5 md:p-6">
          <div className="flex flex-col items-stretch gap-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
                Power Output
              </div>
              <div className="mt-1 text-2xl font-extrabold">
                {isLocked ? (
                  <span className="text-destructive">LIVE — Output deployed</span>
                ) : profileConfirmed ? (
                  <span className="text-warning">Armed — ready to deploy</span>
                ) : (
                  <span className="text-muted-foreground">Select a profile first</span>
                )}
              </div>
            </div>
            <Button
              onClick={togglePower}
              disabled={!connected || (!isLocked && !profileConfirmed)}
              className={`h-16 min-w-[220px] rounded-2xl px-8 text-base font-extrabold tracking-wider shadow-lg ${
                isLocked
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : "hw-btn-primary"
              }`}
            >
              <Power className="mr-2 h-5 w-5" />
              {isLocked ? "CUT POWER" : "DEPLOY POWER (ARM)"}
            </Button>
          </div>
        </section>

        {/* Manual voltage slider (only when MANUAL profile selected) */}
        {isManual && (
          <section className="panel p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold uppercase tracking-wider">Manual PPS Voltage</h2>
              </div>
              <div className="readout px-4 py-2 font-mono-tech text-2xl font-bold text-primary">
                {manualV.toFixed(1)} V
              </div>
            </div>
            <Slider
              min={MANUAL_MIN_V}
              max={MANUAL_MAX_V}
              step={MANUAL_STEP_V}
              value={[manualV]}
              onValueChange={(vals) => onManualVoltChange(vals[0])}
              disabled={!connected || isLocked}
            />
            <div className="mt-2 flex justify-between text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              <span>{MANUAL_MIN_V.toFixed(1)} V</span>
              <span>{MANUAL_MAX_V.toFixed(1)} V</span>
            </div>
            {isLocked && (
              <div className="mt-3 text-xs text-destructive">
                Voltage locked while output is ACTIVE. Cut power to fine-tune.
              </div>
            )}
          </section>
        )}

        {/* Profile selector */}
        <section className="panel p-5 md:p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider">Device Profiles</h2>
              <p className="text-xs text-muted-foreground">
                Tap to stream a full <span className="font-mono-tech">{`{device,voltage,current,polarity,protocol,state}`}</span> frame over serial.
              </p>
            </div>
            {isLocked && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/40 bg-destructive/10 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-destructive">
                <ShieldAlert className="h-3 w-3" /> Locked
              </span>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DEVICES.map((d, i) => {
              const isActive = selectedIdx === i;
              const manualEntry = i === MANUAL_IDX;
              const disabled = !connected || isLocked;
              return (
                <button
                  key={d.name}
                  onClick={() => pickProfile(i)}
                  disabled={disabled}
                  className={`group flex items-center justify-between rounded-xl border p-4 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                    isActive
                      ? "border-primary/70 bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.4)]"
                      : "border-border bg-card hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-bold">
                      {manualEntry ? "[ MANUAL MODE ]" : d.name}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {d.brand} · <span className="font-mono-tech">{d.voltage.toFixed(1)} V · {d.current.toFixed(2)} A</span>
                    </div>
                  </div>
                  {isActive ? (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
                  ) : (
                    <Zap className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

const StatCard = ({
  label, value, accent, small, mono = true,
}: { label: string; value: string; accent?: boolean; small?: boolean; mono?: boolean }) => (
  <div className="panel p-5">
    <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted-foreground">{label}</div>
    <div
      className={`mt-2 truncate font-extrabold ${mono ? "font-mono-tech" : ""} ${
        accent ? "text-primary" : "text-foreground"
      } ${small ? "text-lg" : "text-3xl md:text-4xl"}`}
      title={value}
    >
      {value}
    </div>
  </div>
);

export default Dashboard;
