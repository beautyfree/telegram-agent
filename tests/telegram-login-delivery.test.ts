import { describe, expect, it } from 'vitest';

import { normalizeSentCodeDelivery } from '../src/telegram.js';

describe('normalizeSentCodeDelivery', () => {
  it('maps telegram app delivery and fallback metadata', () => {
    const result = normalizeSentCodeDelivery({
      type: { className: 'auth.SentCodeTypeApp', length: 5 },
      nextType: { className: 'auth.CodeTypeSms' },
      timeout: 60,
    });

    expect(result).toEqual({
      type: 'telegram_app',
      nextType: 'sms',
      timeoutSec: 60,
      length: 5,
    });
  });

  it('falls back to unknown for unrecognized constructors', () => {
    const result = normalizeSentCodeDelivery({
      type: { className: 'auth.SentCodeTypeTotallyNewThing' },
    });

    expect(result.type).toBe('totally_new_thing');
  });
});
