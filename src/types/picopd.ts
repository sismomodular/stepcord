export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TelemetryReading {
  voltage: number;   // V
  current: number;   // A
  power: number;     // W
  timestamp: number; // ms epoch
}

export interface PDO {
  index: number;
  voltage: number;  // V
  current: number;  // A
  type: 'fixed' | 'pps';
  minVoltage?: number; // PPS only
  maxVoltage?: number; // PPS only
}

export interface PPSConfig {
  targetVoltage: number;  // V, e.g. 12.0
  currentLimit: number;   // A, e.g. 2.0
}

export interface DeviceInfo {
  name: string;
  port: string;
  pdVersion: string;
}

export interface AlertThresholds {
  overvoltage: number;
  overcurrent: number;
  overpower: number;
  browserNotifications: boolean;
}

export interface UserPreset {
  id: string;
  name: string;
  voltage: number;
  current: number;
  isCloud: boolean;
}

export interface AppSettings {
  connection: {
    autoReconnect: boolean;
    pollingIntervalMs: number;
    disconnectTimeoutS: number;
  };
  display: {
    showOled: boolean;
    sparklineWindowS: number;
    decimalPrecision: number;
  };
  alerts: AlertThresholds;
  data: {
    saveToCloud: boolean;
    retentionDays: number | null;
  };
}
