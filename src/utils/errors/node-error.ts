export interface NodeError extends Error {
  code: string;
}

export function isNodeError(err: unknown): err is NodeError {
  return err instanceof Error && 'code' in err;
}
