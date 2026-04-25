/**
 * Exit codes:
 *   0 — success
 *   1 — operation completed and reported findings (diff mismatch, validation errors)
 *   2 — usage error or I/O problem (missing file, bad arguments)
 */
export const EXIT_OK = 0;
export const EXIT_USAGE = 2;
export const EXIT_INTERNAL = 3;
