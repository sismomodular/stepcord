import { describe, expect, it } from 'vitest';
import { normalizePolarity, toMusicalDevice, type SyncedDevice } from '@/hooks/useSyncedDevices';

const row = (over: Partial<SyncedDevice> = {}): SyncedDevice => ({
  id: 'row-1',
  source_id: 'src-1',
  name: 'Test Device',
  manufacturer: 'Test Brand',
  voltage: 9,
  current: 1,
  polarity: 'center-positive',
  power: 9,
  connector: null,
  connector_type: null,
  observations: null,
  last_synced_at: new Date().toISOString(),
  ...over,
});

describe('normalizePolarity', () => {
  it('recognises negative variants', () => {
    ['center-negative', 'CENTER_NEGATIVE', 'c-', 'Negative', 'neg'].forEach(v =>
      expect(normalizePolarity(v)).toBe('center-negative'),
    );
  });

  it('recognises positive variants', () => {
    ['center-positive', 'CENTER_POSITIVE', 'c+', 'Positive'].forEach(v =>
      expect(normalizePolarity(v)).toBe('center-positive'),
    );
  });

  it('never falls back to center-positive for unknown or missing values', () => {
    [null, undefined, '', '   ', 'usb', 'unknown', '???'].forEach(v =>
      expect(normalizePolarity(v as string | null)).toBe('unverified'),
    );
  });
});

describe('toMusicalDevice', () => {
  it('keeps complete records verified', () => {
    const d = toMusicalDevice(row());
    expect(d.verified).toBe(true);
    expect(d.voltage).toBe(9);
    expect(d.current).toBe(1);
    expect(d.defaultPolarity).toBe('center-positive');
  });

  it('never invents a voltage or current', () => {
    const d = toMusicalDevice(row({ voltage: null, current: null }));
    expect(d.voltage).toBeNull();
    expect(d.current).toBeNull();
    expect(d.verified).toBe(false);
  });

  it('marks unknown polarity as unverified', () => {
    const d = toMusicalDevice(row({ polarity: null }));
    expect(d.defaultPolarity).toBe('unverified');
    expect(d.verified).toBe(false);
    expect(d.polarityLabel).toMatch(/UNVERIFIED/);
  });
});
