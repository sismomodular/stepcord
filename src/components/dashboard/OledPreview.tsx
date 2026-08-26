import { DeviceInfo } from '../../types/picopd';
import type { FirmwareState } from '../../hooks/usePicoSerial';

interface OledPreviewProps {
  firmwareState: FirmwareState | null;
  deviceInfo: DeviceInfo | null;
}

/**
 * OLED preview — 1:1 mirror of what the firmware renders on the SH1106 128×64.
 *
 * Two modes (matching firmware atualizarDisplay()):
 *  - simpleDisplayMode (auto after 5s LIVE): big voltage + device name
 *  - normal: header line, "Device: <name>", big voltage, footer (LIVE/LIMIT)
 *
 * Web preview uses simple mode whenever state === 3 (LIVE) to match the
 * firmware's auto-switch behaviour after 5s of inactivity.
 */
export default function OledPreview({ firmwareState, deviceInfo }: OledPreviewProps) {
  const connected = !!deviceInfo && !!firmwareState;

  const state = firmwareState?.state ?? 0;
  const voltage = firmwareState?.targetVoltage ?? 0;
  const current = firmwareState?.targetCurrent ?? 0;
  const power = voltage * current;
  const name = firmwareState?.name ?? 'MANUAL CONTROL';
  const isWebMode = firmwareState?.isWebMode ?? false;
  const isLive = state === 3;

  // Match firmware: simple mode kicks in when LIVE
  const simpleMode = connected && isLive;

  return (
    <div>
      <div className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-400">
        OLED preview
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        {/* SH1106 128×64 — render at 2× scale (256×128) for clarity */}
        <div
          className="mx-auto rounded-lg p-3 font-mono"
          style={{
            width: 280,
            height: 152,
            backgroundColor: '#0a0a0a',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
            color: '#ffffff',
          }}
        >
          {!connected ? (
            <div
              className="flex h-full items-center justify-center text-sm"
              style={{ color: '#666' }}
            >
              – – –
            </div>
          ) : simpleMode ? (
            // ===== Simple display mode — profile name prominent, voltage secondary =====
            <div className="flex h-full flex-col justify-center pl-2">
              <div
                className="truncate"
                style={{ fontSize: 18, fontWeight: 600, color: '#ffffff' }}
              >
                {name}
              </div>
              <div
                className="mt-2 tabular-nums leading-none"
                style={{ fontSize: 28, fontWeight: 700, color: '#cfcfcf' }}
              >
                {voltage.toFixed(1)}
                <span style={{ fontSize: 16, marginLeft: 4 }}>V</span>
              </div>
            </div>
          ) : (
            // ===== Normal display mode =====
            <div className="flex h-full flex-col">
              {/* Header: [ WEB PROFILE LOCKED ] or [ MANUAL CONTROL ] */}
              <div style={{ fontSize: 11, color: '#e8e8e8' }}>
                {isWebMode ? '[ WEB PROFILE LOCKED ]' : '[ MANUAL CONTROL ]'}
              </div>
              <div
                className="my-1"
                style={{ height: 1, backgroundColor: '#ffffff', opacity: 0.6 }}
              />

              {/* Device: <name> */}
              <div
                className="truncate"
                style={{ fontSize: 11, color: '#e8e8e8' }}
              >
                Device:{' '}
                <span style={{ color: '#ffffff' }}>{name}</span>
              </div>

              {/* Big voltage (logisoso16) */}
              <div
                className="mt-1 tabular-nums leading-none"
                style={{ fontSize: 28, fontWeight: 700 }}
              >
                {voltage.toFixed(1)}
                <span style={{ fontSize: 16, marginLeft: 4 }}>V</span>
              </div>

              {/* Footer: LIVE (xA) xW   or   LIMIT: xA */}
              <div
                className="mt-auto tabular-nums"
                style={{ fontSize: 11 }}
              >
                {isLive ? (
                  <span style={{ color: '#7CFFB2' }}>
                    ! LIVE ({current.toFixed(1)}A) {power.toFixed(1)}W
                  </span>
                ) : (
                  <span style={{ color: '#FFD479' }}>
                    . LIMIT: {current.toFixed(1)} A
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Sub-caption */}
        <div className="mt-2 text-center text-xs text-gray-400">
          {connected
            ? simpleMode
              ? 'Macro view · LIVE'
              : isWebMode
                ? 'Web profile locked'
                : 'Manual control'
            : 'Awaiting hardware'}
        </div>
      </div>
    </div>
  );
}
