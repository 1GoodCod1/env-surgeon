/**
 * Heuristics for spotting secrets that shouldn't appear in `.env.example`
 * (or in any file meant to be committed). Patterns cover the obvious
 * high-signal formats — we don't try to detect every possible secret.
 */

export interface SecretHit {
  readonly key: string;
  readonly kind: string;
}

interface Detector {
  readonly kind: string;
  readonly test: (value: string) => boolean;
}

const DETECTORS: ReadonlyArray<Detector> = [
  // More-specific patterns first: sk-ant- before sk- so Anthropic isn't swallowed.
  { kind: 'Anthropic key', test: (v) => /^sk-ant-[A-Za-z0-9_-]{20,}$/.test(v) },
  { kind: 'OpenAI key', test: (v) => /^sk-[A-Za-z0-9_-]{20,}$/.test(v) },
  { kind: 'GitHub token', test: (v) => /^gh[pousr]_[A-Za-z0-9]{20,}$/.test(v) },
  { kind: 'AWS access key', test: (v) => /^AKIA[0-9A-Z]{16}$/.test(v) },
  { kind: 'Google API key', test: (v) => /^AIza[0-9A-Za-z_-]{35}$/.test(v) },
  { kind: 'Slack token', test: (v) => /^xox[abprs]-[A-Za-z0-9-]{10,}$/.test(v) },
  { kind: 'Stripe key', test: (v) => /^(sk|pk|rk)_(live|test)_[A-Za-z0-9]{20,}$/.test(v) },
  {
    kind: 'JWT',
    test: (v) => /^eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}$/.test(v),
  },
  {
    kind: 'PEM private key',
    test: (v) => /-----BEGIN (?:[A-Z0-9]+ )?PRIVATE KEY-----/.test(v),
  },
];

export function detectSecret(value: string): string | null {
  for (const d of DETECTORS) {
    if (d.test(value)) return d.kind;
  }
  return null;
}

export function scanMapForSecrets(map: ReadonlyMap<string, string>): ReadonlyArray<SecretHit> {
  const hits: SecretHit[] = [];
  for (const [key, value] of map) {
    const kind = detectSecret(value);
    if (kind !== null) hits.push({ key, kind });
  }
  return hits;
}
