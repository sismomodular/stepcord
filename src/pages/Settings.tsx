import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plug, LayoutDashboard, Bell, Bookmark, Database, User,
  Trash2, Plus, Download,
} from 'lucide-react';

import Toggle from '../components/ui/Toggle';
import { AppSettings, UserPreset } from '../types/picopd';

const defaultSettings: AppSettings = {
  connection: { autoReconnect: true, pollingIntervalMs: 250, disconnectTimeoutS: 5 },
  display: { showOled: true, sparklineWindowS: 60, decimalPrecision: 2 },
  alerts: { overvoltage: 21, overcurrent: 3.5, overpower: 60, browserNotifications: false },
  data: { saveToCloud: true, retentionDays: 30 },
};

const initialPresets: UserPreset[] = [
  { id: '1', name: 'Raspberry Pi', voltage: 5.0, current: 3.0, isCloud: true },
  { id: '3', name: 'LED bench', voltage: 12.0, current: 1.5, isCloud: false },
];

function SettingsRow({
  label, description, control, last,
}: {
  label: string;
  description?: string;
  control: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`flex items-center justify-between gap-4 py-3 ${last ? '' : 'border-b border-gray-100'}`}>
      <div className="min-w-0">
        <div className="text-sm font-medium text-gray-900">{label}</div>
        {description && <div className="mt-0.5 text-xs text-gray-400">{description}</div>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function Card({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-gray-100 bg-white p-5">
      <div className="mb-1 flex items-center gap-2">
        <Icon className="h-4 w-4 text-gray-500" />
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      </div>
      <div>{children}</div>
    </section>
  );
}

const selectCls =
  'rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-900 focus:border-blue-500 focus:outline-none';
const numCls =
  'w-20 rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-right tabular-nums text-gray-900 focus:border-blue-500 focus:outline-none';
const btnCls =
  'rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50';

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(defaultSettings);
  const [presets, setPresets] = useState<UserPreset[]>(initialPresets);

  const update = <K extends keyof AppSettings>(key: K, patch: Partial<AppSettings[K]>) =>
    setSettings(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }));

  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-2xl space-y-4 p-6">
        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
        >
          <ArrowLeft className="h-4 w-4" />
          Dashboard
        </button>

        <h1 className="text-2xl font-semibold text-gray-900">Settings</h1>

        {/* CARD 1: Connection */}
        <Card icon={Plug} title="Connection">
          <SettingsRow
            label="Auto-reconnect on load"
            description="Re-open last serial port when page loads"
            control={
              <Toggle
                checked={settings.connection.autoReconnect}
                onChange={(v) => update('connection', { autoReconnect: v })}
              />
            }
          />
          <SettingsRow
            label="Polling interval"
            description="How often to read telemetry from device"
            control={
              <select
                className={selectCls}
                value={settings.connection.pollingIntervalMs}
                onChange={(e) => update('connection', { pollingIntervalMs: Number(e.target.value) })}
              >
                <option value={100}>100 ms</option>
                <option value={250}>250 ms</option>
                <option value={500}>500 ms</option>
                <option value={1000}>1 s</option>
              </select>
            }
          />
          <SettingsRow
            last
            label="Disconnect timeout"
            description="Mark device offline after N seconds of no response"
            control={
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className={numCls}
                  value={settings.connection.disconnectTimeoutS}
                  onChange={(e) => update('connection', { disconnectTimeoutS: Number(e.target.value) })}
                />
                <span className="text-sm text-gray-500">s</span>
              </div>
            }
          />
        </Card>

        {/* CARD 2: Display */}
        <Card icon={LayoutDashboard} title="Display">
          <SettingsRow
            label="Show OLED preview"
            description="Mirror the hardware display in the dashboard"
            control={
              <Toggle
                checked={settings.display.showOled}
                onChange={(v) => update('display', { showOled: v })}
              />
            }
          />
          <SettingsRow
            label="Sparkline window"
            description="Time range shown in telemetry mini-charts"
            control={
              <select
                className={selectCls}
                value={settings.display.sparklineWindowS}
                onChange={(e) => update('display', { sparklineWindowS: Number(e.target.value) })}
              >
                <option value={30}>30 s</option>
                <option value={60}>60 s</option>
                <option value={300}>5 min</option>
              </select>
            }
          />
          <SettingsRow
            last
            label="Decimal precision"
            description="Digits shown on voltage and current readouts"
            control={
              <select
                className={selectCls}
                value={settings.display.decimalPrecision}
                onChange={(e) => update('display', { decimalPrecision: Number(e.target.value) })}
              >
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            }
          />
        </Card>

        {/* CARD 3: Alerts */}
        <Card icon={Bell} title="Alerts">
          <SettingsRow
            label="Overvoltage threshold"
            control={
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className={numCls}
                  value={settings.alerts.overvoltage}
                  onChange={(e) => update('alerts', { overvoltage: Number(e.target.value) })}
                />
                <span className="text-sm text-gray-500">V</span>
              </div>
            }
          />
          <SettingsRow
            label="Overcurrent threshold"
            control={
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  step={0.1}
                  className={numCls}
                  value={settings.alerts.overcurrent}
                  onChange={(e) => update('alerts', { overcurrent: Number(e.target.value) })}
                />
                <span className="text-sm text-gray-500">A</span>
              </div>
            }
          />
          <SettingsRow
            label="Overpower threshold"
            control={
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  className={numCls}
                  value={settings.alerts.overpower}
                  onChange={(e) => update('alerts', { overpower: Number(e.target.value) })}
                />
                <span className="text-sm text-gray-500">W</span>
              </div>
            }
          />
          <SettingsRow
            last
            label="Browser notifications"
            description="Show system notification on alert trigger"
            control={
              <Toggle
                checked={settings.alerts.browserNotifications}
                onChange={(v) => update('alerts', { browserNotifications: v })}
              />
            }
          />
        </Card>

        {/* CARD 4: Voltage presets */}
        <Card icon={Bookmark} title="Voltage presets">
          <div>
            {presets.map((p, i) => (
              <div
                key={p.id}
                className={`flex items-center justify-between gap-4 py-3 ${
                  i < presets.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-gray-900">{p.name}</div>
                  <div className="mt-0.5 font-mono text-xs text-gray-500">
                    {p.voltage.toFixed(1)} V · {p.current.toFixed(1)} A
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    p.isCloud
                      ? 'bg-blue-50 text-blue-700'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {p.isCloud ? 'cloud' : 'local'}
                </span>
                <button
                  onClick={() => setPresets(prev => prev.filter(x => x.id !== p.id))}
                  className="text-red-400 hover:text-red-600"
                  aria-label={`Delete ${p.name}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() =>
              setPresets(prev => [
                ...prev,
                {
                  id: Date.now().toString(),
                  name: 'New preset',
                  voltage: 5.0,
                  current: 3.0,
                  isCloud: false,
                },
              ])
            }
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Add preset
          </button>
        </Card>

        {/* CARD 5: Data & privacy */}
        <Card icon={Database} title="Data & privacy">
          <SettingsRow
            label="Save sessions to cloud"
            description="Store telemetry history in your account"
            control={
              <Toggle
                checked={settings.data.saveToCloud}
                onChange={(v) => update('data', { saveToCloud: v })}
              />
            }
          />
          <SettingsRow
            label="Retention period"
            description="Auto-delete telemetry older than"
            control={
              <select
                className={selectCls}
                value={settings.data.retentionDays ?? 'forever'}
                onChange={(e) => {
                  const v = e.target.value;
                  update('data', { retentionDays: v === 'forever' ? null : Number(v) });
                }}
              >
                <option value={7}>7 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
                <option value="forever">Forever</option>
              </select>
            }
          />
          <SettingsRow
            last
            label="Export all data"
            description="Download your full telemetry history"
            control={
              <button
                onClick={() => alert('Export coming soon')}
                className={`${btnCls} inline-flex items-center gap-1.5`}
              >
                <Download className="h-4 w-4" />
                Export
              </button>
            }
          />
        </Card>

        {/* CARD 6: Account */}
        <Card icon={User} title="Account">
          <SettingsRow
            label="Email"
            description="user@example.com"
            control={<button className={btnCls}>Change</button>}
          />
          <SettingsRow
            label="Password"
            description="Last changed 3 months ago"
            control={<button className={btnCls}>Update</button>}
          />
          <SettingsRow
            label="Connected providers"
            description="Google · GitHub"
            control={<button className={btnCls}>Manage</button>}
          />
          <SettingsRow
            last
            label="Delete account"
            control={
              <button
                onClick={() => {
                  if (confirm('Delete your account and all data? This cannot be undone.')) {
                    alert('Account deletion coming soon');
                  }
                }}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm font-medium text-red-500 hover:bg-red-50"
              >
                Delete
              </button>
            }
          />
        </Card>
      </div>
    </div>
  );
}
