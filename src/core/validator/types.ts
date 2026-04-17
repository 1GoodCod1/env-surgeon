export type FieldType =
  | 'string'
  | 'number'
  | 'boolean'
  | 'url'
  | 'email'
  | 'json'
  | 'port'
  | 'duration'
  | 'secret'
  | 'array';

export interface FieldSchema {
  readonly type: FieldType;
  readonly required?: boolean;
  readonly default?: string;
  readonly min?: number;
  readonly max?: number;
  readonly pattern?: string;
  readonly enum?: ReadonlyArray<string>;
  readonly oneOf?: ReadonlyArray<string>;
  /** For type=array: the delimiter between items. Default `,`. */
  readonly separator?: string;
  /** For type=array: validate each item against this type. Default `string`. */
  readonly itemType?: 'string' | 'number' | 'url' | 'email';
  /** For type=secret: minimum Shannon entropy (bits per char). Default 3.0. */
  readonly minEntropy?: number;
}

export type Schema = Record<string, FieldSchema>;

export interface ValidationError {
  readonly key: string;
  readonly error: string;
}

export interface ValidationResult {
  readonly errors: ReadonlyArray<ValidationError>;
  readonly ok: boolean;
}

export interface LoadSchemaOptions {
  /** When set, JS schemas outside this root are rejected to prevent arbitrary code execution. */
  readonly allowedRoot?: string;
}

export interface ValidateOptions {
  /** If true, keys present in env but absent from schema produce errors. */
  readonly strict?: boolean;
}

export const VALID_TYPES = new Set<FieldType>([
  'string',
  'number',
  'boolean',
  'url',
  'email',
  'json',
  'port',
  'duration',
  'secret',
  'array',
]);

export function isFieldSchema(value: unknown): value is FieldSchema {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.type === 'string' && VALID_TYPES.has(v.type as FieldType);
}

export function isSchema(value: unknown): value is Schema {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every(isFieldSchema);
}
