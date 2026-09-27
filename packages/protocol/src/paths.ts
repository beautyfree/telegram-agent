/**
 * Cross-platform paths for telegram-agent.
 *
 * Default base directory: `~/.telegram-agent/`. Hidden dotfile shape
 * keeps state out of platform-specific app-data locations and makes it
 * obvious to users where their session lives. Override with the
 * `TG_APP_DIR` env var when you need a custom location.
 *
 * This shared location keeps skill instructions consistent across platforms
 * and preserves the state directory used by the gram.js-based 1.x CLI.
 */

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { getAccountDir, getRootDir, selectedAccount } from './accounts';

const platform = process.platform;

// ---------------------------------------------------------------------------
// Application data directory (TDLib database, media cache, daemon PID/port)
// ---------------------------------------------------------------------------

export function getAppDir(): string {
  return getAccountDir(selectedAccount());
}

export function getConfigDir(): string {
  return getAppDir();
}

// ---------------------------------------------------------------------------
// TDLib native library
// ---------------------------------------------------------------------------

/** Platform-specific library filename. */
export function getTdjsonFilename(): string {
  switch (platform) {
    case 'darwin':
      return 'libtdjson.dylib';
    case 'win32':
      return 'tdjson.dll';
    default:
      return 'libtdjson.so';
  }
}

/** Directory where the installed TDLib library lives. */
export function getLibDir(): string {
  switch (platform) {
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'),
        'telegram-agent',
        'lib',
      );
    default:
      return path.join(homedir(), '.local', 'lib', 'telegram-agent');
  }
}

/** Full path to the installed TDLib native library. */
export function getInstalledTdjsonPath(): string {
  return path.join(getLibDir(), getTdjsonFilename());
}

/**
 * Search for tdjson in multiple locations.
 *
 * Search order:
 *   1. `prebuilt-tdlib` npm package (resolves the right
 *      `@prebuilt-tdlib/<platform>` peer at runtime) — works inside
 *      any node_modules tree, including ours during dev and our
 *      published consumers.
 *   2. Standard install path (`~/.local/lib/telegram-agent/`) —
 *      Homebrew / curl installer.
 *   3. Relative to binary: `../lib/telegram-agent/` (Homebrew when
 *      `process.execPath` is the brew shim).
 *   4. Relative to binary: `../lib/` (npm platform-package layout).
 */
export function findTdjsonPath(): string | null {
  const filename = getTdjsonFilename();

  // 1. prebuilt-tdlib npm package — preferred path when consumer
  //    installs us via `npm i` / `bun install`.
  try {
    // Dynamic require so tsc doesn't choke on the optional dep type
    // and so the lookup is lazy (no penalty when other paths win).
    const { getTdjson } = require('prebuilt-tdlib');
    const p = getTdjson?.();
    if (typeof p === 'string' && existsSync(p)) return p;
  } catch {
    // package not installed or platform variant missing — fall through
  }

  const installed = getInstalledTdjsonPath();
  if (existsSync(installed)) return installed;

  const binDir = path.dirname(process.execPath);
  const brewPath = path.join(binDir, '..', 'lib', 'telegram-agent', filename);
  if (existsSync(brewPath)) return brewPath;

  const npmPath = path.join(binDir, '..', 'lib', filename);
  if (existsSync(npmPath)) return npmPath;

  return null;
}

// ---------------------------------------------------------------------------
// Derived paths (convenience)
// ---------------------------------------------------------------------------

export const ROOT_DIR = getRootDir();
export const ACCOUNT_NAME = selectedAccount();
export const APP_DIR = getAppDir();
export const CONFIG_DIR = getConfigDir();
export const DB_DIR = path.join(APP_DIR, 'tdlib_db');
export const FILES_DIR = path.join(APP_DIR, 'media_cache');
export const PID_FILE = path.join(APP_DIR, 'tg_daemon.pid');
export const PORT_FILE = path.join(APP_DIR, 'tg_daemon.port');
export const LOG_FILE = path.join(APP_DIR, 'tg_daemon.log');
export const CREDENTIALS_FILE = path.join(CONFIG_DIR, 'credentials');
