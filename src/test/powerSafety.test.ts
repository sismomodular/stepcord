import { describe, expect, it } from 'vitest';
import {
  acDeviceGuard,
  assertVoltageInRange,
  auditPowerDatabase,
  currentHeadroom,
  incompleteDataGuard,
  isMainsOrAc,
  polarityMismatch,
  VoltageRangeError,
} from '@/lib/powerSafety';
import { POWER_DB, VOLTAGE_MAX, VOLTAGE_MIN, type PowerSpec } from '@/data/devicePower';

const spec = (over: Partial<PowerSpec> = {}): PowerSpec => ({
  id: 'x',
  brand: 'Test',
  model: 'Unit',
  power_voltage: 9,
  power_current_ma: 1000,
  power_polarity: 'center_positive',
  connector_type: 'barrel_5.5x2.1',
  ...over,
});

describe('assertVoltageInRange', () => {
  it('accepts the inclusive bounds', () => {
    expect(() => assertVoltageInRange(VOLTAGE_MIN)).not.toThrow();
    expect(() => assertVoltageInRange(VOLTAGE_MAX)).not.toThrow();
    expect(() => assertVoltageInRange(9)).not.toThrow();
  });

  it('rejects values outside the envelope and non-finite input', () => {
    expect(() => assertVoltageInRange(VOLTAGE_MIN - 0.1)).toThrow(VoltageRangeError);
    expect(() => assertVoltageInRange(VOLTAGE_MAX + 0.1)).toThrow(VoltageRangeError);
    expect(() => assertVoltageInRange(NaN)).toThrow(VoltageRangeError);
    expect(() => assertVoltageInRange(Number.POSITIVE_INFINITY)).toThrow(VoltageRangeError);
  });
});

describe('isMainsOrAc / acDeviceGuard', () => {
  it('flags mains and ac specs', () => {
    expect(isMainsOrAc(spec({ power_polarity: 'iec_mains' }))).toBe(true);
    expect(isMainsOrAc(spec({ power_polarity: 'ac' }))).toBe(true);
    expect(isMainsOrAc(spec())).toBe(false);
    expect(isMainsOrAc(null)).toBe(false);
  });

  it('blocks DC control of mains devices', () => {
    expect(acDeviceGuard(spec({ power_polarity: 'iec_mains' }))?.level).toBe('blocked');
    expect(acDeviceGuard(spec())).toBeNull();
    expect(acDeviceGuard(null)).toBeNull();
  });
});

describe('polarityMismatch', () => {
  it('warns when the expected polarity is unknown', () => {
    const r = polarityMismatch(null, 'center_positive');
    expect(r.level).toBe('warning');
    expect(r.code).toBe('UNVERIFIED_POLARITY');
  });

  it('flags a reversed DC pair as danger', () => {
    expect(polarityMismatch('center_negative', 'center_positive').level).toBe('danger');
    expect(polarityMismatch('center_positive', 'center_negative').level).toBe('danger');
  });

  it('warns on other incompatible pairs and passes on a match', () => {
    expect(polarityMismatch('usb_c_pd', 'center_positive').level).toBe('warning');
    expect(polarityMismatch('center_positive', 'center_positive').level).toBe('ok');
  });
});

describe('currentHeadroom', () => {
  it('reports missing reference data', () => {
    expect(currentHeadroom(1000, null).code).toBe('NO_CURRENT_SPEC');
  });

  it('flags insufficient current as danger', () => {
    expect(currentHeadroom(500, 1000).level).toBe('danger');
  });

  it('warns above 20% overhead and passes within nominal', () => {
    expect(currentHeadroom(1300, 1000).level).toBe('warning');
    expect(currentHeadroom(1100, 1000).level).toBe('ok');
    expect(currentHeadroom(1000, 1000).level).toBe('ok');
  });
});

describe('incompleteDataGuard', () => {
  it('blocks when the voltage is unknown', () => {
    expect(incompleteDataGuard(null, 1, 'center_positive')?.level).toBe('blocked');
    expect(incompleteDataGuard(NaN, 1, 'center_positive')?.level).toBe('blocked');
  });

  it('warns on missing current or polarity', () => {
    expect(incompleteDataGuard(9, null, 'center_positive')?.code).toBe('MISSING_CURRENT');
    expect(incompleteDataGuard(9, 1, null)?.code).toBe('UNVERIFIED_POLARITY');
  });

  it('passes on complete data', () => {
    expect(incompleteDataGuard(9, 1, 'center_positive')).toBeNull();
  });
});

describe('auditPowerDatabase', () => {
  it('has no danger-level findings in the shipped database', () => {
    const dangers = auditPowerDatabase(POWER_DB).filter(f => f.level === 'danger');
    expect(dangers).toEqual([]);
  });
});
