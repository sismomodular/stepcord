import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  AlertCircle,
  BatteryCharging,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  MonitorCheck,
  Music2,
  Plug,
  PlugZap,
  Settings2,
  Usb,
  Zap,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { useSerialTelemetry } from "@/hooks/useSerialTelemetry";
import { DEVICES } from "@/data/devices";

const Index = () => {
  const { supported, status, error, telemetry, connect, disconnect, send } = useSerialTelemetry();

  // Highlighted device under the OLED cursor (cycled by buttons).
  const [cursorIdx, setCursorIdx] = useState(0);
  // Confirmed/active device — what the PicoPD is actually programmed to.
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  const cursorDevice = DEVICES[cursorIdx];
  const activeDevice = activeIdx !== null ? DEVICES[activeIdx] : null;

  const liveV = telemetry?.v ?? activeDevice?.voltage ?? 0;
  const liveI = telemetry?.i ?? 0;
  const liveP = +(((telemetry?.p ?? liveV * liveI)) || 0).toFixed(2);
  const live = status === "connected" && telemetry !== null;

  const cycle = (delta: 1 | -1) => {
    setCursorIdx((idx) => (idx + delta + DEVICES.length) % DEVICES.length);
  };

  const confirmDevice = (idx: number) => {
    const d = DEVICES[idx];
    setCursorIdx(idx);
    setActiveIdx(idx);
    // Automatically send PPS request with the device's required V & I.
    void send({ cmd: "setMode", mode: "PPS" });
    void send({ cmd: "setVoltage", v: d.voltage });
    // Reuse profile slot to also signal current limit downstream if firmware supports it.
    void send({ cmd: "setProfile", idx });
  };

  // Keyboard shortcuts mirror the physical buttons (← → cycle, Enter confirm).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown" || e.key === "ArrowRight") cycle(1);
      else if (e.key === "ArrowUp" || e.key === "ArrowLeft") cycle(-1);
      else if (e.key === "Enter") confirmDevice(cursorIdx);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cursorIdx]);

  const oledList = useMemo(() => {
    // Show 3 surrounding entries on the faux 128x64 OLED.
    const before = DEVICES[(cursorIdx - 1 + DEVICES.length) % DEVICES.length];
    const after = DEVICES[(cursorIdx + 1) % DEVICES.length];
    return { before, current: cursorDevice, after };
  }, [cursorIdx, cursorDevice]);

  return (
    <div className="min-h-screen px-4 py-8 md:px-8 md:py-12">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-accent shadow-[var(--shadow-glow)]">
              <Music2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
                <span className="text-gradient">PicoPD</span> Device Selector
              </h1>
              <p className="text-sm text-muted-foreground">
                Per-device PPS power profiles · AP33772S
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className={
                live
                  ? "gap-1.5 border-success/40 bg-success/10 text-success"
                  : status === "connecting"
                  ? "gap-1.5 border-warning/40 bg-warning/10 text-warning"
                  : "gap-1.5 border-border/60 bg-secondary/40 text-muted-foreground"
              }
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  live ? "animate-pulse-glow bg-success" : status === "connecting" ? "bg-warning" : "bg-muted-foreground"
                }`}
              />
              {live ? "Live · WebSerial" : status === "connecting" ? "Connecting" : status === "unsupported" ? "WebSerial unsupported" : "Disconnected"}
            </Badge>
            <Badge variant="outline" className="gap-1 border-border/60 text-muted-foreground">
              <Cpu className="h-3 w-3" /> RP2040
            </Badge>
            {status === "connected" ? (
              <Button size="sm" variant="outline" onClick={() => void disconnect()} className="gap-2">
                <Plug className="h-3.5 w-3.5" /> Disconnect
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={() => void connect()}
                disabled={!supported || status === "connecting"}
                className="gap-2"
              >
                <PlugZap className="h-3.5 w-3.5" />
                {status === "connecting" ? "Connecting…" : "Connect device"}
              </Button>
            )}
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {!supported && (
          <div className="rounded-lg border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-muted-foreground">
            WebSerial isn't available in this browser. Open the dashboard in Chrome or Edge on desktop to connect to the PicoPD over USB.
          </div>
        )}

        {/* Top stats — now device-centric */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard
            label="Active Device"
            value={activeDevice ? activeDevice.name : "—"}
            unit=""
            icon={Music2}
            accent="primary"
          />
          <StatCard label="Live Voltage" value={liveV.toFixed(2)} unit="V" icon={Zap} accent="accent" />
          <StatCard label="Live Current" value={liveI.toFixed(2)} unit="A" icon={Activity} accent="primary" />
          <StatCard label="Power" value={liveP.toFixed(1)} unit="W" icon={BatteryCharging} accent="accent" />
        </div>

        {/* Main grid */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* OLED preview + controls */}
          <Card className="lg:col-span-2 overflow-hidden border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MonitorCheck className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                  OLED Live Preview · 128×64 SSD1306
                </h2>
              </div>
              <Badge variant="outline" className="border-primary/40 text-primary">I2C 0x3C</Badge>
            </div>

            {/* Faux OLED display — device-centric layout */}
            <div className="relative mx-auto aspect-[2/1] w-full max-w-md overflow-hidden rounded-lg border border-primary/30 bg-black p-4 shadow-[var(--shadow-elevated)]">
              <div className="absolute inset-0 oled-grid opacity-50" />
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary to-transparent animate-scan" />
              <div className="relative flex h-full flex-col justify-between font-mono text-primary">
                <div className="flex items-baseline justify-between text-[10px] opacity-70">
                  <span>DEVICE SELECT</span>
                  <span>{activeDevice ? "● ACTIVE" : "○ IDLE"}</span>
                </div>

                <div className="flex flex-col items-center leading-tight">
                  <div className="text-[10px] opacity-40 truncate">{oledList.before.name}</div>
                  <div className="text-2xl font-extrabold tracking-tight drop-shadow-[0_0_8px_hsl(var(--primary))] truncate">
                    ▸ {oledList.current.name}
                  </div>
                  <div className="text-[10px] opacity-60">
                    {oledList.current.voltage.toFixed(1)}V · {oledList.current.current.toFixed(2)}A · {oledList.current.defaultPolarity === "center-positive" ? "C+" : "C−"}
                  </div>
                  <div className="text-[10px] opacity-40 truncate">{oledList.after.name}</div>
                </div>

                <div className="flex items-center justify-between text-[10px] opacity-70">
                  <span>{liveV.toFixed(2)}V</span>
                  <span>{liveI.toFixed(2)}A</span>
                  <span>{liveP.toFixed(1)}W</span>
                </div>
              </div>
            </div>

            {/* Controls — emulate physical buttons */}
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <Button variant="outline" onClick={() => cycle(-1)} className="h-14 gap-2">
                <ChevronUp className="h-4 w-4" /> Prev
              </Button>
              <Button onClick={() => confirmDevice(cursorIdx)} className="h-14 gap-2">
                <CheckCircle2 className="h-4 w-4" /> Confirm
              </Button>
              <Button variant="outline" onClick={() => cycle(1)} className="h-14 gap-2">
                <ChevronDown className="h-4 w-4" /> Next
              </Button>
            </div>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Buttons cycle the device list. Confirm sends a PPS request at {cursorDevice.voltage.toFixed(1)}V / {cursorDevice.current.toFixed(2)}A.
            </p>
          </Card>

          {/* Device list */}
          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <div className="mb-4 flex items-center gap-2">
              <Usb className="h-4 w-4 text-accent" />
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Musical Devices
              </h2>
            </div>
            <div className="max-h-[26rem] space-y-2 overflow-y-auto pr-1">
              {DEVICES.map((d, i) => {
                const isCursor = i === cursorIdx;
                const isActive = i === activeIdx;
                return (
                  <button
                    key={d.name}
                    onClick={() => confirmDevice(i)}
                    onMouseEnter={() => setCursorIdx(i)}
                    className={`flex w-full items-center justify-between rounded-lg border p-3 text-left transition-[var(--transition-smooth)] ${
                      isActive
                        ? "border-primary/60 bg-primary/10 shadow-[var(--shadow-glow)]"
                        : isCursor
                        ? "border-primary/40 bg-secondary/70"
                        : "border-border/60 bg-secondary/40 hover:border-primary/30 hover:bg-secondary/70"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-md ${isActive ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                        <Music2 className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="font-semibold leading-tight">{d.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {d.voltage.toFixed(1)}V · {d.current.toFixed(2)}A · {d.defaultPolarity === "center-positive" ? "C+" : "C−"}
                        </div>
                      </div>
                    </div>
                    {isActive && <CheckCircle2 className="h-4 w-4 text-primary" />}
                  </button>
                );
              })}
            </div>
          </Card>
        </div>

        {/* Bottom row */}
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              System Health
            </h2>
            <div className="space-y-5">
              <Metric label="I2C Bus Stability" value={98} />
              <Metric label="PD Negotiation" value={100} />
              <Metric label="OLED Refresh" value={92} />
              <Metric label="Polling Loop" value={74} hint="Optimization pending" />
            </div>
          </Card>

          <Card className="border-border/60 bg-[var(--gradient-card)] p-6 shadow-[var(--shadow-card)]">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Active Profile
            </h2>
            {activeDevice ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 p-4">
                  <div>
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Powering</div>
                    <div className="text-xl font-bold">{activeDevice.name}</div>
                    {activeDevice.brand && <div className="text-xs text-muted-foreground">{activeDevice.brand}</div>}
                  </div>
                  <Settings2 className="h-5 w-5 text-primary" />
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <MiniStat label="Target V" value={`${activeDevice.voltage.toFixed(2)}V`} />
                  <MiniStat label="Max I" value={`${activeDevice.current.toFixed(2)}A`} />
                  <MiniStat label="Polarity" value={activeDevice.defaultPolarity === "center-positive" ? "C+" : "C−"} />
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                  <div className="text-sm">
                    <div className="font-medium text-foreground">No device selected</div>
                    <p className="text-muted-foreground">
                      Cycle through the list with the buttons (or ↑/↓) and press Confirm to send a PPS request.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
};

const StatCard = ({
  label,
  value,
  unit,
  icon: Icon,
  accent,
}: {
  label: string;
  value: string;
  unit: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: "primary" | "accent";
}) => (
  <Card className="relative overflow-hidden border-border/60 bg-[var(--gradient-card)] p-5 shadow-[var(--shadow-card)]">
    <div className="flex items-start justify-between">
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
      <Icon className={`h-4 w-4 ${accent === "primary" ? "text-primary" : "text-accent"}`} />
    </div>
    <div className="mt-3 flex items-baseline gap-1">
      <span className="truncate text-2xl font-bold tracking-tight md:text-3xl">{value}</span>
      {unit && <span className="text-sm text-muted-foreground">{unit}</span>}
    </div>
  </Card>
);

const Metric = ({ label, value, hint }: { label: string; value: number; hint?: string }) => (
  <div>
    <div className="mb-1.5 flex items-center justify-between text-sm">
      <span className="text-foreground">{label}</span>
      <span className="font-mono text-muted-foreground">{value}%</span>
    </div>
    <Progress value={value} className="h-1.5" />
    {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
  </div>
);

const MiniStat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-md border border-border/40 bg-secondary/30 px-2 py-3">
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="font-mono text-sm font-semibold">{value}</div>
  </div>
);

export default Index;
