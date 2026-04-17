/**
 * User-facing error. `cli.ts` unwraps these into friendly messages
 * without a stack trace; anything else is treated as an internal bug.
 */
export class UserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserError';
  }
}
