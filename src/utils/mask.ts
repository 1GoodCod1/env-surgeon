/**
 * Masks a potentially sensitive value for display in logs/CI output.
 * Shows length bucket only — never a prefix, since prefixes of tokens
 * (e.g. `sk-`, `ghp_`) can still aid targeted attacks.
 */
export function maskValue(value: string): string {
  if (value.length === 0) return '(empty)';
  if (value.length <= 4) return '***';
  return `*** (${value.length} chars)`;
}
