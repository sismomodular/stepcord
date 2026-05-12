import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

const pad = (s: string | number, n: number) => String(s).padStart(n, " ");

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
  const outputOn = activeIdx !== null && live;

  const requestPPS = useCallback(
    (v: number) => {
      void send({ cmd: "setMode", mode: "PPS" });
      void send({ cmd: "setVoltage", v: +v.toFixed(2) });
    },
    [send],
  );

  const cycle = (delta: 1 | -1) => {
    if (isManualCursor && (isManualActive || activeIdx === null)) {
      setManualV((prev) => {
        const next = clampManual(prev + delta * MANUAL_STEP_V);
        if (isManualActive && next <= MANUAL_SAFETY_THRESHOLD_V) requestPPS(next);
        return next;
      });
      return;
    }
    setCursorIdx((idx) => (idx + delta + DEVICES.length) % DEVICES.length);
  };

  const applyDevice = useCallback(
    (idx: number) => {
      const d = DEVICES[idx];
      setCursorIdx(idx);
      setActiveIdx(idx);
      if (idx === MANUAL_IDX) {
        requestPPS(manualV);
        void send({ cmd: "setProfile", idx });
      } else {
        void send({ cmd: "setMode", mode: "PPS" });
        void send({ cmd: "setVoltage", v: d.voltage });
        void send({ cmd: "setProfile", idx });
      }
    },
    [manualV, requestPPS, send],
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
          requestPPS(manualV);
          void send({ cmd: "setProfile", idx: MANUAL_IDX });
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

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return DEVICES
      .map((d, i) => ({ d, i }))
      .filter(({ i }) => i !== MANUAL_IDX)
      .filter(({ d }) => !q || d.name.toLowerCase().includes(q) || (d.brand ?? "").toLowerCase().includes(q));
  }, [query]);

  const headerName = isManualCursor ? "MANUAL PPS" : cursorDevice.name.toUpperCase();
  const polarity: Polarity = (isManualCursor ? "center-positive" : cursorDevice.defaultPolarity);

  const statusLabel =
    live ? "LINK OK" :
    status === "connecting" ? "LINK..." :
    status === "unsupported" ? "NO USB" : "NO LINK";

  return (
    <div className="min-h-screen w-full flex items-start justify-center bg-black p-3 sm:p-6">
      <div className="w-full max-w-[720px]">
        {/* Hardware bezel */}
        <div className="oled-bezel">
          {/* Module label strip */}
          <div className="flex items-center justify-between px-1 pb-2 text-[10px] uppercase tracking-[0.3em]" style={{ color: "#888", fontFamily: "'VT323', monospace" }}>
            <span>my[zap]volts · interceptor</span>
            <span>SSD1306 · 128x64 SIM</span>
          </div>

          {/* OLED screen */}
          <div className="oled-screen font-oled">
            {/* Header bar */}
            <div className="oled-invert flex items-center justify-between px-2 py-0.5 text-[18px] leading-none">
              <span>{outputOn ? "OUT  ON " : "OUT  OFF"}</span>
              <span>{statusLabel}</span>
            </div>

            {/* Big voltage readout */}
            <div className="mt-3 text-center">
              <div className="font-pixel text-[12px] tracking-[0.3em]" style={{ opacity: 0.85 }}>VBUS</div>
              <div
                className="font-oled leading-none"
                style={{ fontSize: "92px", letterSpacing: "0.02em" }}
              >
                {liveV.toFixed(2)}
                <span style={{ fontSize: "44px" }}> V</span>
              </div>
              <div className="font-oled text-[20px]" style={{ marginTop: -4 }}>
                I = {liveI.toFixed(2)} A    P = {(liveV * liveI).toFixed(2)} W
              </div>
            </div>

            {/* Divider */}
            <div className="my-3" style={{ borderTop: "1px dashed #fff", opacity: 0.6 }} />

            {/* Device + polarity rows */}
            <div className="grid grid-cols-[80px_1fr] gap-x-2 text-[20px]">
              <div>DEV :</div>
              <div className="truncate">
                <span className="oled-blink">&gt;</span> {headerName}
              </div>

              <div>BRAND:</div>
              <div className="truncate">{isManualCursor ? "USER" : (cursorDevice.brand ?? "-").toUpperCase()}</div>

              <div>TGT V:</div>
              <div>
                {isManualCursor
                  ? `${manualV.toFixed(2)} V  [${MANUAL_MIN_V.toFixed(1)}-${MANUAL_MAX_V.toFixed(1)}]`
                  : `${cursorDevice.voltage.toFixed(2)} V  @  ${cursorDevice.current.toFixed(2)} A`}
              </div>

              <div>POL  :</div>
              <div>
                {polarity === "center-positive" ? "(-)-(+)  CENTER POSITIVE" : "(+)-(-)  CENTER NEGATIVE"}
              </div>

              <div>MODE :</div>
              <div>
                {isManualActive ? "PPS  MANUAL" : activeDevice ? "PPS  PROFILE" : "IDLE"}
                {activeIdx === cursorIdx && activeDevice ? "   *ACTIVE*" : ""}
              </div>
            </div>

            {/* Manual hold progress bar (ASCII style) */}
            {isManualCursor && needsSafetyHold && (
              <div className="mt-3 text-[18px]">
                SAFETY &gt; 12V — HOLD ENTER:
                <div className="mt-1 font-oled tracking-[0.15em]">
                  [{"#".repeat(Math.round(holdProgress * 20)).padEnd(20, "·")}]
                </div>
              </div>
            )}

            {error && (
              <div className="mt-3 oled-invert px-2 py-0.5 text-[18px] leading-none">
                ! {error}
              </div>
            )}
          </div>

          {/* Footer hint strip on bezel */}
          <div className="flex items-center justify-between px-1 pt-2 text-[10px] uppercase tracking-[0.3em]" style={{ color: "#888", fontFamily: "'VT323', monospace" }}>
            <span>ENC ROT = SCROLL</span>
            <span>CLICK = CONFIRM</span>
            <span>HOLD = BACK</span>
          </div>
        </div>

        {/* Hardware control row */}
        <div className="mt-4 grid grid-cols-3 gap-3">
          <button onClick={() => cycle(-1)} className="oled-btn">[ &lt; PREV ]</button>
          <button
            onMouseDown={handleConfirmDown}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={handleConfirmDown}
            onTouchEnd={cancelHold}
            className="oled-btn"
          >
            [ ENTER ]
          </button>
          <button onClick={() => cycle(1)} className="oled-btn">[ NEXT &gt; ]</button>
        </div>

        {/* Connection + manual toggles */}
        <div className="mt-3 grid grid-cols-2 gap-3">
          {status === "connected" ? (
            <button onClick={() => void disconnect()} className="oled-btn">[ DISCONNECT ]</button>
          ) : (
            <button
              onClick={() => void connect()}
              disabled={!supported || status === "connecting"}
              className="oled-btn"
            >
              {status === "connecting" ? "[ LINKING... ]" : "[ CONNECT USB ]"}
            </button>
          )}
          <button
            onClick={() => setCursorIdx(MANUAL_IDX)}
            className={`oled-btn ${isManualCursor ? "oled-invert" : ""}`}
          >
            [ MANUAL PPS ]
          </button>
        </div>

        {/* Manual +/- when in manual */}
        {isManualCursor && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <button onClick={() => setManualV((v) => clampManual(v - MANUAL_STEP_V))} className="oled-btn">[ -0.1 V ]</button>
            <div className="oled-btn text-center">{manualV.toFixed(2)} V</div>
            <button onClick={() => setManualV((v) => clampManual(v + MANUAL_STEP_V))} className="oled-btn">[ +0.1 V ]</button>
          </div>
        )}

        {/* SEARCH MENU — strict: only entry to device DB */}
        {!isManualCursor && (
          <div className="mt-5 oled-bezel">
            <div className="oled-screen font-oled">
              <div className="oled-invert px-2 py-0.5 text-[18px] leading-none">
                &gt; SEARCH DEVICE
              </div>
              <div className="mt-2 flex items-center gap-2 text-[20px]">
                <span>FIND:</span>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value.toUpperCase())}
                  placeholder="TYPE NAME..."
                  className="flex-1 bg-transparent outline-none border-0 border-b border-white text-white placeholder:text-white/40 font-oled text-[20px] uppercase"
                  style={{ borderRadius: 0 }}
                />
                <span className="oled-blink">_</span>
              </div>

              <div className="mt-3 max-h-[260px] overflow-y-auto text-[20px] leading-tight">
                {filtered.map(({ d, i }) => {
                  const isCursor = i === cursorIdx;
                  const isActive = i === activeIdx;
                  return (
                    <button
                      key={d.name}
                      onClick={() => applyDevice(i)}
                      onMouseEnter={() => setCursorIdx(i)}
                      className={`w-full text-left px-2 py-0.5 flex items-center justify-between ${isCursor ? "oled-invert" : ""}`}
                    >
                      <span className="truncate">
                        {isCursor ? ">" : " "} {d.name.toUpperCase()}
                      </span>
                      <span className="ml-2 shrink-0 font-oled">
                        {pad(d.voltage.toFixed(1), 4)}V {isActive ? "*" : " "}
                      </span>
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="px-2 py-3 text-center">-- NO MATCH --</div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Tiny serial number / footer */}
        <div className="mt-3 text-center text-[10px] uppercase tracking-[0.4em]" style={{ color: "#666", fontFamily: "'VT323', monospace" }}>
          PicoPD Pro · AP33772S · FW 1.0
        </div>
      </div>
    </div>
  );
};

export default Index;
