import { describe, expect, it } from 'vitest';
import { getStoredToken, setStoredToken } from './api';

describe('SCADA Frontend Auth Storage', () => {
  it('stores and clears token cleanly', () => {
    const store: Record<string, string> = {};
    (globalThis as unknown as { localStorage: Storage }).localStorage = {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
      clear: () => {},
      key: () => null,
      length: 0,
    };

    expect(getStoredToken()).toBeNull();
    setStoredToken('tok-123');
    expect(getStoredToken()).toBe('tok-123');
    setStoredToken(null);
    expect(getStoredToken()).toBeNull();
  });
});
