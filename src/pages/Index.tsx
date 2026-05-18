import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ExternalLink,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Minus,
  Plug,
  PlugZap,
  Plus,
  Search,
  ShieldAlert,
  SlidersHorizontal,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useSerialTelemetry } from "@/hooks/useSerialTelemetry";
import {
  DEVICES,
  MANUAL_IDX,
  MANUAL_MIN_V,
  MANUAL_MAX_V,
  MANUAL_STEP_V,
  MANUAL_SAFETY_THRESHOLD_V,
  MANUAL_SAFETY_HOLD_MS,
  type Polarity,
} from "@/data/devices";

const clampManual = (v: number) =>
  Math.min(MANUAL_MAX_V, Math.max(MANUAL_MIN_V, Math.round(v * 10) / 10));

const Index = () => {
  const { supported, status, error, telemetry, connect, disconnect, send } = useSerialTelemetry();

  const [cursorIdx, setCursorIdx] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);
  const [manualV, setManualV] = useState<number>(5.0);
  const [holdProgress, setHoldProgress] = useState(0);
  const [query, setQuery] = useState("");
  const holdStartRef = useRef<number | null>(null);
  const holdRafRef = useRef<number | null>(null);

  const cursorDevice = DEVICES[cursorIdx];
  const activeDevice = activeIdx !== null ? DEVICES[activeIdx] : null;
  const isManualCursor = cursorIdx === MANUAL_IDX;
  const isManualActive = activeIdx === MANUAL_IDX;

  const liveV = telemetry?.v ?? (isManualActive ? manualV : activeDevice?.voltage ?? 0);
  const liveI = telemetry?.i ?? 0;
  const live = status === "connected" && telemetry !== null;

  const requestManual = useCallback(
    (v: number) => {
      void send({ setProfile: Number(MANUAL_IDX), manualVolt: Number(v.toFixed(1)) });
    },
    [send],
  );

  const cycle = (delta: 1 | -1) => {
    if (isManualCursor && (isManualActive || activeIdx === null)) {
      setManualV((prev) => {
        const next = clampManual(prev + delta * MANUAL_STEP_V);
        if (isManualActive && next <= MANUAL_SAFETY_THRESHOLD_V) requestManual(next);
        return next;
      });
      return;
    }
    setCursorIdx((idx) => (idx + delta + DEVICES.length) % DEVICES.length);
  };

  const applyDevice = useCallback(
    (idx: number) => {
      setCursorIdx(idx);
      setActiveIdx(idx);
      if (idx === MANUAL_IDX) {
        void send({ setProfile: Number(MANUAL_IDX), manualVolt: Number(manualV.toFixed(1)) });
      } else {
        void send({ setProfile: Number(idx) });
      }
    },
    [send, manualV],
  );

  const needsSafetyHold = isManualCursor && manualV > MANUAL_SAFETY_THRESHOLD_V;

  const cancelHold = useCallback(() => {
    holdStartRef.current = null;
    if (holdRafRef.current != null) cancelAnimationFrame(holdRafRef.current);
    holdRafRef.current = null;
    setHoldProgress(0);
  }, []);

  const handleConfirmDown = useCallback(() => {
    if (needsSafetyHold) {
      holdStartRef.current = performance.now();
      const tick = () => {
        if (holdStartRef.current == null) return;
        const elapsed = performance.now() - holdStartRef.current;
        const p = Math.min(1, elapsed / MANUAL_SAFETY_HOLD_MS);
        setHoldProgress(p);
        if (p >= 1) {
          holdStartRef.current = null;
          setHoldProgress(0);
          setActiveIdx(MANUAL_IDX);
          setCursorIdx(MANUAL_IDX);
          void send({ teste: Number(MANUAL_IDX) });
          return;
        }
        holdRafRef.current = requestAnimationFrame(tick);
      };
      holdRafRef.current = requestAnimationFrame(tick);
      return;
    }
    applyDevice(cursorIdx);
  }, [applyDevice, cursorIdx, manualV, needsSafetyHold, requestPPS, send]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "ArrowDown" || e.key === "ArrowRight") cycle(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") cycle(-1);
      else if (e.key === "Enter") handleConfirmDown();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === "Enter") cancelHold();
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursorIdx, isManualCursor, isManualActive, manualV, needsSafetyHold]);

  useEffect(() => () => cancelHold(), [cancelHold]);

  // Filter excludes Manual entry — manual mode has its own toggle.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEVICES
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i !== MANUAL_IDX)
      .filter(({ d }) => !q || d.name.toLowerCase().includes(q) || (d.brand ?? "").toLowerCase().includes(q));
  }, [query]);

  const headerName = isManualCursor ? "MANUAL · PPS" : cursorDevice.name.toUpperCase();
  const polarity: Polarity = (isManualCursor ? "center-positive" : cursorDevice.defaultPolarity);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-8 md:py-10 space-y-6">
        {/* Header */}
        <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <Logo />
            <div className="hidden sm:block">
              <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Interceptor Dashboard</div>
              <div className="text-sm font-semibold text-foreground">USB-C PD / PPS · AP33772S</div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <StatusPill live={live} status={status} />
            {status === "connected" ? (
              <Button size="sm" variant="outline" onClick={() => void disconnect()} className="hw-btn gap-2 rounded-full">
                <Plug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void connect()}
                disabled={!supported || status === "connecting"}
                className="hw-btn-primary gap-2 rounded-full"
              >
                <PlugZap className="h-3.5 w-3.5" />
                {status === "connecting" ? "Connecting…" : "Connect"}
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-xl border border-destructive/40 bg-destructive/5 px-4 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
        {!supported && (
          <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-2.5 text-sm text-foreground">
            WebSerial isn't available in this browser. Open in Chrome or Edge on desktop to connect.
          </div>
        )}

        {/* Power Meter */}
        <section className="panel p-6 md:p-8">
          {/* Top: Device Name */}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground">
                {activeDevice ? "Powering" : "Selected"}
              </div>
              <h1 className="mt-1 truncate text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
                {headerName}
              </h1>
              <div className="mt-1 text-sm text-muted-foreground">
                {isManualCursor
                  ? `Range ${MANUAL_MIN_V.toFixed(1)} – ${MANUAL_MAX_V.toFixed(1)} V · 100 mV steps`
                  : `${cursorDevice.brand ?? ""} · target ${cursorDevice.voltage.toFixed(2)} V @ ${cursorDevice.current.toFixed(2)} A`}
              </div>
            </div>
            {activeIdx === cursorIdx && activeDevice && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-dot" />
                ACTIVE
              </span>
            )}
          </div>

          {/* Center: Readouts */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Readout label="VOLTAGE" unit="V" value={liveV.toFixed(2)} />
            <Readout label="CURRENT" unit="A" value={liveI.toFixed(2)} />
          </div>

          {/* Manual mode controls or device cycle */}
          {isManualCursor ? (
            <div className="mt-6 rounded-xl border border-border bg-muted/40 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-foreground">
                  <SlidersHorizontal className="h-4 w-4 text-primary" />
                  Manual PPS · target
                </div>
                {manualV > MANUAL_SAFETY_THRESHOLD_V && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-warning">
                    <ShieldAlert className="h-3.5 w-3.5" /> Safety lock &gt; 12 V
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <Button onClick={() => cycle(-1)} className="hw-btn h-14 w-14 rounded-2xl text-foreground" aria-label="-100 mV">
                  <Minus className="h-5 w-5" />
                </Button>
                <div className="readout flex-1 px-4 py-3 text-center">
                  <div className="font-mono-tech text-3xl font-bold md:text-4xl">
                    {manualV.toFixed(2).padStart(5, "0")}<span className="text-primary/70 text-xl"> V</span>
                  </div>
                </div>
                <Button onClick={() => cycle(1)} className="hw-btn h-14 w-14 rounded-2xl text-foreground" aria-label="+100 mV">
                  <Plus className="h-5 w-5" />
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-6 grid grid-cols-3 gap-3">
              <Button onClick={() => cycle(-1)} className="hw-btn h-14 rounded-2xl gap-2 text-foreground">
                <ChevronUp className="h-4 w-4" /> Prev
              </Button>
              <Button
                onClick={() => { if (!needsSafetyHold) handleConfirmDown(); }}
                onMouseDown={() => { if (needsSafetyHold) handleConfirmDown(); }}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={() => { if (needsSafetyHold) handleConfirmDown(); }}
                onTouchEnd={cancelHold}
                className="hw-btn-primary relative h-14 overflow-hidden rounded-2xl"
              >
                <span className="relative flex items-center gap-2 font-semibold">
                  <CheckCircle2 className="h-4 w-4" /> Confirm
                </span>
              </Button>
              <Button onClick={() => cycle(1)} className="hw-btn h-14 rounded-2xl gap-2 text-foreground">
                <ChevronDown className="h-4 w-4" /> Next
              </Button>
            </div>
          )}

          {isManualCursor && (
            <div className="mt-3">
              <Button
                onClick={() => { if (!needsSafetyHold) handleConfirmDown(); }}
                onMouseDown={() => { if (needsSafetyHold) handleConfirmDown(); }}
                onMouseUp={cancelHold}
                onMouseLeave={cancelHold}
                onTouchStart={() => { if (needsSafetyHold) handleConfirmDown(); }}
                onTouchEnd={cancelHold}
                className={`hw-btn-primary relative h-12 w-full overflow-hidden rounded-2xl ${needsSafetyHold ? "" : ""}`}
              >
                {needsSafetyHold && (
                  <span
                    className="absolute inset-y-0 left-0 bg-foreground/20"
                    style={{ width: `${holdProgress * 100}%` }}
                  />
                )}
                <span className="relative flex items-center gap-2 font-semibold">
                  {needsSafetyHold ? <ShieldAlert className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                  {needsSafetyHold ? "Hold 2 s to apply" : "Apply manual voltage"}
                </span>
              </Button>
            </div>
          )}

          {/* Bottom: Polarity */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <PolarityCard active={polarity === "center-positive"} polarity="center-positive" />
            <PolarityCard active={polarity === "center-negative"} polarity="center-negative" />
          </div>
        </section>

        {/* Manual PPS toggle + Device list */}
        <section className="panel p-5 md:p-6">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">Device Database</h2>
              <p className="text-xs text-muted-foreground">Select a musical device to send its PPS profile.</p>
            </div>
            <button
              onClick={() => setCursorIdx(MANUAL_IDX)}
              className={`hw-btn inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                isManualCursor ? "!bg-primary !text-primary-foreground !border-primary" : "text-foreground"
              }`}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Manual PPS
            </button>
          </div>

          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search devices in database…"
                className="hw-btn h-11 rounded-full pl-9"
                disabled={isManualCursor}
                aria-label="Search devices"
              />
            </div>
            <a
              href={`https://myvolts.com/powermygear/${query.trim() ? `?q=${encodeURIComponent(query.trim())}` : ""}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hw-btn inline-flex items-center justify-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground whitespace-nowrap"
              title="Open the full myVolts catalog in a new tab"
            >
              <ExternalLink className="h-4 w-4" />
              Search on myVolts
            </a>
          </div>

          {!isManualCursor && (
            <div className="grid gap-2 sm:grid-cols-2">
              {filtered.map(({ d, i }) => {
                const isCursor = i === cursorIdx;
                const isActive = i === activeIdx;
                return (
                  <button
                    key={d.name}
                    onClick={() => applyDevice(i)}
                    onMouseEnter={() => setCursorIdx(i)}
                    className={`flex items-center justify-between rounded-xl border p-3 text-left transition-[var(--transition-smooth)] ${
                      isActive
                        ? "border-success/60 bg-success/5"
                        : isCursor
                        ? "border-primary/60 bg-primary/5"
                        : "border-border bg-card hover:border-primary/40"
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm font-bold text-foreground">{d.name}</div>
                      <div className="truncate text-xs text-muted-foreground">
                        {d.brand} · <span className="font-mono-tech">{d.voltage.toFixed(1)}V · {d.current.toFixed(2)}A</span>
                      </div>
                    </div>
                    {isActive ? (
                      <CheckCircle2 className="h-5 w-5 text-success" />
                    ) : (
                      <Zap className={`h-4 w-4 ${isCursor ? "text-primary" : "text-muted-foreground"}`} />
                    )}
                  </button>
                );
              })}
              {filtered.length === 0 && (
                <div className="col-span-full rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  No devices match "{query}".
                </div>
              )}
            </div>
          )}

          {isManualCursor && (
            <div className="rounded-xl border border-warning/40 bg-warning/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                <div className="text-sm">
                  <div className="font-semibold text-foreground">Manual PPS mode</div>
                  <p className="text-muted-foreground">
                    Use the <span className="font-mono-tech">−/+</span> controls above to tune the target voltage in 100 mV steps.
                    Voltages above 12 V require a 2 s hold-to-confirm to protect 9 V pedals.
                  </p>
                  <button
                    onClick={() => setCursorIdx(0)}
                    className="mt-2 text-xs font-semibold text-primary hover:underline"
                  >
                    ← Back to device list
                  </button>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};

import myVoltsLogo from "@/assets/myvolts-logo.png";

const Logo = () => (
  <a href="https://myvolts.com" target="_blank" rel="noreferrer" className="flex items-center">
    <img
      src={myVoltsLogo}
      alt="myVolts"
      className="h-9 w-auto object-contain"
      loading="eager"
      decoding="async"
    />
  </a>
);

const StatusPill = ({ live, status }: { live: boolean; status: string }) => {
  const label =
    live ? "LIVE" :
    status === "connecting" ? "CONNECTING" :
    status === "unsupported" ? "UNSUPPORTED" : "OFFLINE";
  const color =
    live ? "bg-success/10 text-success border-success/30" :
    status === "connecting" ? "bg-warning/10 text-warning border-warning/30" :
    "bg-muted text-muted-foreground border-border";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-bold tracking-wider ${color}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-success animate-pulse-dot" : status === "connecting" ? "bg-warning" : "bg-muted-foreground"}`} />
      {label}
    </span>
  );
};

const Readout = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
  <div className="readout px-5 py-4">
    <div className="flex items-baseline justify-between text-[10px] font-semibold tracking-[0.2em] text-primary/70">
      <span>{label}</span>
      <span>{unit}</span>
    </div>
    <div className="mt-1 font-mono-tech text-5xl font-bold text-primary md:text-6xl">
      {value}
    </div>
  </div>
);

const PolarityCard = ({ active, polarity }: { active: boolean; polarity: Polarity }) => {
  const isPos = polarity === "center-positive";
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-3 transition-[var(--transition-smooth)] ${
        active ? "border-success/60 bg-success/5" : "border-border bg-muted/30 opacity-60"
      }`}
    >
      <PolarityIcon positive={isPos} active={active} />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Polarity</div>
        <div className="text-sm font-bold text-foreground">
          {isPos ? "Center Positive" : "Center Negative"}
        </div>
      </div>
      {active && (
        <span className="ml-auto rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-bold text-success">
          ACTIVE
        </span>
      )}
    </div>
  );
};

const PolarityIcon = ({ positive, active }: { positive: boolean; active: boolean }) => {
  const stroke = active ? "hsl(var(--success))" : "hsl(var(--muted-foreground))";
  return (
    <svg width="44" height="44" viewBox="0 0 44 44" fill="none" aria-hidden>
      <circle cx="22" cy="22" r="14" stroke={stroke} strokeWidth="2" />
      <circle cx="22" cy="22" r="5" fill={stroke} />
      <text x="14" y="10" fontSize="9" fontWeight="700" fill={stroke}>
        {positive ? "+" : "−"}
      </text>
      <text x="28" y="10" fontSize="9" fontWeight="700" fill={stroke}>
        {positive ? "−" : "+"}
      </text>
    </svg>
  );
};

export default Index;
