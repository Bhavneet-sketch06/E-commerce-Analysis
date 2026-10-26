import { describe, it, expect } from 'vitest';
import { config, redact } from '../src/config.js';

describe('logs never contain the bot token', () => {
  it('hides the token in error messages and nested errors', () => {
    const saved = config.telegramToken;
    config.telegramToken = '1234567890:AAFakeTokenForTestsOnly_abcdefghijk';
    try {
      const inner = new Error(`request to https://api.telegram.org/bot${config.telegramToken}/getMe failed, reason: ETIMEDOUT`);
      const outer = Object.assign(new Error("Network request for 'getMe' failed!"), { error: inner });
      const out = redact(outer);
      expect(out).not.toContain(config.telegramToken);
      expect(out).toContain('<bot-token>');
      expect(redact(`plain ${config.telegramToken}`)).toBe('plain <bot-token>');
    } finally {
      config.telegramToken = saved;
    }
  });
});
