/**
 * Repo env loading for the operations scripts (2026-11-19).
 *
 * These scripts used `dotenv`, which is not a declared dependency of the repository root, so the import resolved only by
 * luck of hoisting — and under the scripts type-check it did not resolve at all. Node 20.12+ has `process.loadEnvFile`,
 * which is the same job without a dependency. Missing files are ignored, which is what `dotenv.config()` did: a script
 * run without `apps/web/.env.local` should still read the root `.env`.
 *
 * Existing variables win, matching `--env-file` semantics and the previous `config()` order (web `.env.local` first, then
 * the root `.env`): a value already exported by the shell is not overwritten by a file.
 */
export function loadEnv(...paths: Array<string>): void {
  for (const path of paths) {
    try {
      process.loadEnvFile(path);
    } catch {
      // A missing or unreadable env file is not an error here; the next path may exist.
    }
  }
}
