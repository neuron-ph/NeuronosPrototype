import { describe, it, expect } from 'vitest';
import { withLegacyOption, withLegacyStringOption } from './legacyOption';

describe('withLegacyOption', () => {
  it('returns the original options unchanged when the current value is empty', () => {
    const opts = [{ value: 'a', label: 'A' }];
    expect(withLegacyOption(opts, '')).toEqual(opts);
    expect(withLegacyOption(opts, null)).toEqual(opts);
    expect(withLegacyOption(opts, undefined)).toEqual(opts);
  });

  it('returns the original options unchanged when current value is already in options', () => {
    const opts = [{ value: 'Form E', label: 'Form E' }, { value: 'Form D', label: 'Form D' }];
    expect(withLegacyOption(opts, 'Form E')).toEqual(opts);
  });

  it('appends a synthetic legacy option when current value is not in options', () => {
    const opts = [{ value: 'Form E', label: 'Form E' }, { value: 'Form D', label: 'Form D' }];
    const result = withLegacyOption(opts, 'Form A');
    expect(result).toHaveLength(3);
    expect(result[2]).toEqual({ value: 'Form A', label: 'Form A (legacy)' });
  });
});

describe('withLegacyStringOption', () => {
  it('appends the legacy current value to a string option list', () => {
    expect(withLegacyStringOption(['Form E', 'Form D'], 'Form A')).toEqual(['Form E', 'Form D', 'Form A']);
  });

  it('does not duplicate when value is already present', () => {
    expect(withLegacyStringOption(['Form E', 'Form D'], 'Form E')).toEqual(['Form E', 'Form D']);
  });

  it('returns a fresh copy when current value is empty', () => {
    const orig = ['Form E', 'Form D'];
    const result = withLegacyStringOption(orig, '');
    expect(result).toEqual(orig);
    expect(result).not.toBe(orig);
  });
});
