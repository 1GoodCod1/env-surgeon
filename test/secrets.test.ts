import { describe, it, expect } from 'vitest';
import { detectSecret, scanMapForSecrets } from '../src/utils/secrets.js';

describe('detectSecret', () => {
  it('detects OpenAI keys', () => {
    expect(detectSecret('sk-abcdefghij1234567890abcdefghij')).toBe('OpenAI key');
  });

  it('detects Anthropic keys', () => {
    expect(detectSecret('sk-ant-abcdefghij1234567890abcdefghij')).toBe('Anthropic key');
  });

  it('detects GitHub tokens', () => {
    expect(detectSecret('ghp_abcdefghij1234567890AB')).toBe('GitHub token');
    expect(detectSecret('gho_abcdefghij1234567890AB')).toBe('GitHub token');
    expect(detectSecret('ghu_abcdefghij1234567890AB')).toBe('GitHub token');
    expect(detectSecret('ghs_abcdefghij1234567890AB')).toBe('GitHub token');
    expect(detectSecret('ghr_abcdefghij1234567890AB')).toBe('GitHub token');
  });

  it('detects AWS access keys', () => {
    expect(detectSecret('AKIAIOSFODNN7EXAMPLE')).toBe('AWS access key');
  });

  it('detects Google API keys', () => {
    expect(detectSecret('AIzaSyA1234567890abcdefghijklmnopqrstuv')).toBe('Google API key');
  });

  it('detects Slack tokens', () => {
    expect(detectSecret('xoxb-12345678-abcdefgh')).toBe('Slack token');
  });

  it('detects Stripe keys', () => {
    expect(detectSecret('sk_live_abcdefghij1234567890ab')).toBe('Stripe key');
    expect(detectSecret('pk_test_abcdefghij1234567890ab')).toBe('Stripe key');
  });

  it('detects JWTs', () => {
    expect(
      detectSecret(
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
      ),
    ).toBe('JWT');
  });

  it('detects PEM private keys', () => {
    expect(detectSecret('-----BEGIN RSA PRIVATE KEY-----\nMIIBog...')).toBe('PEM private key');
  });

  it('returns null for regular values', () => {
    expect(detectSecret('localhost')).toBeNull();
    expect(detectSecret('3000')).toBeNull();
    expect(detectSecret('true')).toBeNull();
    expect(detectSecret('my-app-name')).toBeNull();
  });
});

describe('scanMapForSecrets', () => {
  it('finds secrets in a map', () => {
    const map = new Map([
      ['PORT', '3000'],
      ['API_KEY', 'sk-abcdefghij1234567890abcdefghij'],
      ['HOST', 'localhost'],
    ]);
    const hits = scanMapForSecrets(map);
    expect(hits).toHaveLength(1);
    expect(hits[0]!.key).toBe('API_KEY');
    expect(hits[0]!.kind).toBe('OpenAI key');
  });

  it('returns empty array when no secrets found', () => {
    const map = new Map([
      ['PORT', '3000'],
      ['DEBUG', 'true'],
    ]);
    expect(scanMapForSecrets(map)).toHaveLength(0);
  });
});
