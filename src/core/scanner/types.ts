export interface ScanOptions {
  readonly dir: string;
  readonly extensions?: ReadonlyArray<string>;
  /** Maximum size (bytes) of a single file to scan. Larger files are skipped. */
  readonly maxFileBytes?: number;
  /**
   * When true, also honors patterns from `.gitignore` files. Off by default
   * because it can surprise users who actually want to scan ignored-but-checked-in
   * files (like `dist/` checked in for library projects).
   */
  readonly respectGitignore?: boolean;
  /**
   * Extra glob patterns to ignore, merged with the built-in defaults
   * (`node_modules`, `dist`, `.next`, etc.). Useful for project-specific
   * directories like `vendor/`, `lib/`, `generated/`.
   */
  readonly ignore?: ReadonlyArray<string>;
}

export interface ScanResult {
  readonly variables: ReadonlyArray<string>;
  readonly occurrences: ReadonlyMap<string, ReadonlyArray<string>>;
  readonly skipped: ReadonlyArray<string>;
}
