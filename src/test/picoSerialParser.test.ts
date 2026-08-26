import { describe, expect, it } from 'vitest';
import { parsePicoLine } from '@/hooks/usePicoSerial';

describe('parsePicoLine', () => {
  it('ignores empty lines', () => {
    expect(parsePicoLine('')).toBeNull();
    expect(parsePicoLine('   \r')).toBeNull();
  });

  it('parses a full telemetry frame', () => {
    const line =
      '{"v":9.01,"i":0.42,"p":3.78,"mode":"FIXED","profile":"Volca Series","polarity":"center-positive","en":true,"err":""}';
    const parsed = parsePicoLine(line);
    expect(parsed?.kind).toBe('telemetry');
    if (parsed?.kind !== 'telemetry') return;
    expect(parsed.telemetry).toMatchObject({
      v: 9.01,
      i: 0.42,
      p: 3.78,
      mode: 'FIXED',
      profile: 'Volca Series',
      polarity: 'center-positive',
      en: true,
      err: '',
    });
  });

  it('derives power and defaults when fields are missing', () => {
    const parsed = parsePicoLine('{"v":12,"i":2}');
    expect(parsed?.kind).toBe('telemetry');
    if (parsed?.kind !== 'telemetry') return;
    expect(parsed.telemetry.p).toBe(24);
    expect(parsed.telemetry.mode).toBe('FIXED');
    expect(parsed.telemetry.en).toBe(false);
    expect(parsed.telemetry.polarity).toBeNull();
  });

  it('surfaces firmware errors in telemetry', () => {
    const parsed = parsePicoLine('{"v":0,"i":0,"err":"UNKNOWN PROFILE"}');
    expect(parsed?.kind === 'telemetry' && parsed.telemetry.err).toBe('UNKNOWN PROFILE');
  });

  it('parses encoder events in both notations', () => {
    expect(parsePicoLine('ENC:CW')).toEqual({ kind: 'encoder', dir: 'CW' });
    expect(parsePicoLine('ENC:CCW')).toEqual({ kind: 'encoder', dir: 'CCW' });
    expect(parsePicoLine('{"enc":"ccw"}')).toEqual({ kind: 'encoder', dir: 'CCW' });
  });

  it('treats non-JSON and malformed JSON as log lines', () => {
    expect(parsePicoLine('booting...')).toEqual({ kind: 'log', message: 'booting...' });
    expect(parsePicoLine('{"v":')).toEqual({ kind: 'log', message: '{"v":' });
    expect(parsePicoLine('{"status":"ok"}')).toEqual({ kind: 'log', message: '{"status":"ok"}' });
  });
});
