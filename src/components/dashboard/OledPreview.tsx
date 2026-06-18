import { PDO, TelemetryReading, DeviceInfo } from '../../types/picopd';

interface OledPreviewProps {
  reading: TelemetryReading;
  activePdo: PDO | null;
  deviceInfo: DeviceInfo | null;
}

export default function OledPreview({ reading, activePdo, deviceInfo }: OledPreviewProps) {
  const connected = !!deviceInfo;

  const fmt = (n: number, w = 5, d = 2) =>
    connected ? n.toFixed(d).padStart(w, ' ') : '– – –';

  const pdoLine = connected && activePdo
    ? activePdo.type === 'pps'
      ? `PDO ${activePdo.index} · PPS`
      : `PDO ${activePdo.index} · ${activePdo.voltage}V/${activePdo.current}A`
    : '– – –';

  const devLine = connected && deviceInfo
    ? `${deviceInfo.name} · ${deviceInfo.pdVersion}`
    : '– – –';

  const Row = ({ label, value, unit }: { label: string; value: string; unit: string }) => (
    <div className="flex items-center">
      <span style={{ color: '#e8e8e8' }} className="w-6">{label}</span>
      <span
        style={{ color: '#ffffff' }}
        className="w-12 inline-block text-right font-medium tabular-nums"
      >
        {value}
      </span>
      <span style={{ color: '#666666' }} className="ml-2">{unit}</span>
    </div>
  );

  return (
    <div>
      <div className="mb-3 text-xs font-medium uppercase tracking-widest text-gray-400">
        OLED preview
      </div>
      <div className="rounded-2xl border border-gray-100 bg-white p-5">
        <div
          className="rounded-lg p-3 font-mono text-sm leading-6"
          style={{
            backgroundColor: '#0a0a0a',
            boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.06)',
          }}
        >
          <Row label="V:" value={fmt(reading.voltage)} unit="V" />
          <Row label="I:" value={fmt(reading.current)} unit="A" />
          <Row label="P:" value={fmt(reading.power)} unit="W" />
          <div className="mt-2 text-xs" style={{ color: '#aaaaaa' }}>{pdoLine}</div>
          <div className="text-xs" style={{ color: '#aaaaaa' }}>{devLine}</div>
        </div>
      </div>
    </div>
  );
}
