/**
 * Daemon lifecycle management — spawn, check, wait, run.
 *
 * The CLI auto-starts the daemon if it's not running, then communicates
 * with it over HTTP via TelegramClient.
 *
 * The daemon is the same binary running in `--daemon` mode: `tg --daemon`
 * starts the TDLib proxy and stays alive as a background process. This
 * works for both the compiled binary and dev mode (bun + script).
 */

import { appendFileSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acquireAccountLocks } from '@tg/protocol/account-lock';
import { requireAccount, selectedAccount } from '@tg/protocol/accounts';
import {
  APP_DIR,
  CREDENTIALS_FILE,
  findTdjsonPath,
  LOG_FILE,
  PID_FILE,
  PORT_FILE,
  ROOT_DIR,
} from '@tg/protocol/paths';
import {
  authorizationHeaders,
  daemonUrl,
  ensurePrivateDirectory,
  getDaemonToken,
  requireSecureDaemon,
} from '@tg/protocol/security';

export { APP_DIR, LOG_FILE };

const DEFAULT_PORT = 0;
const IDLE_TIMEOUT_MS = 10 * 60 * 1000;

// ---------------------------------------------------------------------------
// PID / port file helpers
// ---------------------------------------------------------------------------

function safeUnlink(filePath: string): void {
  try {
    unlinkSync(filePath);
  } catch {
    // Already removed or never existed
  }
}

function cleanupFiles(): void {
  safeUnlink(PID_FILE);
  safeUnlink(PORT_FILE);
}

function daemonLog(msg: string): void {
  const ts = new Date().toISOString();
  appendFileSync(LOG_FILE, `[${ts}] ${msg}\n`);
}

// ---------------------------------------------------------------------------
// Credential loading
// ---------------------------------------------------------------------------

/**
 * Load TDLib API credentials.
 *
 * Search order:
 *   1. Environment variables: TG_API_ID / TG_API_HASH
 *   2. Environment variables: VITE_TG_API_ID / VITE_TG_API_HASH
 *   3. Platform config dir credentials file
 *   4. App data dir .env
 *   5. Monorepo root .env (dev mode only)
 *   6. Build-time embedded credentials (compiled binary)
 */
export function loadCredentials(): { apiId: number; apiHash: string } {
  // 1–2. Environment variables
  const envId = process.env.TG_API_ID ?? process.env.VITE_TG_API_ID;
  const envHash = process.env.TG_API_HASH ?? process.env.VITE_TG_API_HASH;
  if (envId && envHash) {
    const apiId = Number(envId);
    if (apiId && envHash) return { apiId, apiHash: envHash };
  }

  // 3–5. Config/env files
  const candidates = [
    CREDENTIALS_FILE,
    path.join(APP_DIR, '.env'),
    path.join(ROOT_DIR, 'credentials'),
    path.join(ROOT_DIR, '.env'),
    path.resolve(import.meta.dir, '../../../.env'), // monorepo root (dev mode)
  ];

  for (const filePath of candidates) {
    try {
      const text = readFileSync(filePath, 'utf-8');
      const vars: Record<string, string> = {};
      for (const line of text.split('\n')) {
        const m = line.match(/^(\w+)=(.*)$/);
        if (m?.[1] && m[2] !== undefined) vars[m[1]] = m[2];
      }
      const apiId = Number(vars.TG_API_ID ?? vars.VITE_TG_API_ID);
      const apiHash = vars.TG_API_HASH ?? vars.VITE_TG_API_HASH ?? '';
      if (apiId && apiHash) return { apiId, apiHash };
    } catch {
      // File doesn't exist or can't be read — try next
    }
  }

  // 6. Build-time embedded credentials (replaced by --define at compile time)
  const builtinId = process.env.TG_BUILTIN_API_ID;
  const builtinHash = process.env.TG_BUILTIN_API_HASH;
  if (builtinId && builtinHash) {
    const apiId = Number(builtinId);
    if (apiId) return { apiId, apiHash: builtinHash };
  }

  throw new Error(
    'TDLib API credentials not found. Set TG_API_ID and TG_API_HASH environment variables.',
  );
}

// ---------------------------------------------------------------------------
// Client-side: check, spawn, wait, ensure
// ---------------------------------------------------------------------------

/** Read the daemon PID from the PID file and verify the process is alive. */
export function getDaemonPid(): number | null {
  try {
    const raw = readFileSync(PID_FILE, 'utf-8').trim();
    const pid = Number(raw);
    if (Number.isNaN(pid) || pid <= 0) return null;
    process.kill(pid, 0); // signal 0 = existence check
    return pid;
  } catch {
    return null;
  }
}

/** Check if the daemon process is running. */
export function isDaemonRunning(): boolean {
  return getDaemonPid() !== null;
}

/** Read the selected daemon port, or null before it has started. */
export function getDaemonPort(): number | null {
  try {
    const raw = readFileSync(PORT_FILE, 'utf-8').trim();
    const port = Number(raw);
    if (Number.isInteger(port) && port > 0 && port < 65536) return port;
  } catch {
    // Port file doesn't exist or is unreadable
  }
  return null;
}

/**
 * Build the command to spawn the daemon as a background process.
 * Compiled binary: ['/path/to/telegram-agent', '--daemon']
 * Dev mode:        ['/path/to/bun', '/path/to/index.ts', '--daemon']
 */
function getDaemonSpawnArgs(): string[] {
  const maybeScript = process.argv[1];
  if (maybeScript?.endsWith('.ts') || maybeScript?.endsWith('.js')) {
    return [process.execPath, maybeScript, '--daemon'];
  }
  return [process.execPath, '--daemon'];
}

/** Spawn the daemon as a detached background process. */
export function spawnDaemon(): void {
  const args = getDaemonSpawnArgs();
  const child = Bun.spawn(args, {
    stdio: ['ignore', 'ignore', 'ignore'],
    env: { ...process.env },
    detached: true,
  });
  child.unref();
}

/**
 * Discover the selected account's bound port and wait for authenticated health.
 * Polls every 100ms for up to five seconds.
 */
export async function ensureDaemon(): Promise<{ port: number; url: string }> {
  const token = getDaemonToken();
  if (!isDaemonRunning()) spawnDaemon();
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const port = getDaemonPort();
    if (port) {
      let response: Response | undefined;
      try {
        response = await fetch(`${daemonUrl(port)}/health`, {
          headers: authorizationHeaders(token),
          redirect: 'error',
          signal: AbortSignal.timeout(1000),
        });
      } catch {
        /* Still starting. */
      }
      if (response) {
        requireSecureDaemon(response);
        return { port, url: daemonUrl(port) };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    'Selected account daemon did not respond to an authenticated health check within 5 seconds',
  );
}

// ---------------------------------------------------------------------------
// Daemon mode: `tg --daemon` — runs the persistent TDLib proxy
// ---------------------------------------------------------------------------

/**
 * Run the daemon in the current process. This is called when the CLI
 * is invoked with `--daemon`. The process stays alive serving HTTP.
 *
 * Responsibilities:
 *   1. PID/port file management
 *   2. Load credentials, start proxy
 *   3. Idle timeout (10 min, deferred if SSE connections active)
 *   4. Signal handlers (SIGINT, SIGTERM, SIGHUP → graceful shutdown)
 *   5. Crash handlers (uncaughtException, unhandledRejection)
 */
export async function runDaemonMode(): Promise<void> {
  const account = selectedAccount();
  const releaseStartup = acquireAccountLocks([account]);
  requireAccount(account);
  ensurePrivateDirectory(APP_DIR);

  // Check for existing daemon
  if (existsSync(PID_FILE)) {
    try {
      const pid = Number(readFileSync(PID_FILE, 'utf-8').trim());
      if (pid > 0) {
        process.kill(pid, 0); // throws if dead
        daemonLog(`Daemon already running at PID ${pid}`);
        process.exit(0);
      }
    } catch (e: unknown) {
      const err = e as NodeJS.ErrnoException;
      if (err.code === 'EPERM') {
        daemonLog('Daemon already running (EPERM)');
        process.exit(0);
      }
      // ESRCH = stale PID file — remove and continue
      safeUnlink(PID_FILE);
    }
  }

  writeFileSync(PID_FILE, String(process.pid));

  const credentials = loadCredentials();
  daemonLog(`API credentials loaded (ID: ${credentials.apiId})`);

  const port = Number(process.env.TG_DAEMON_PORT) || DEFAULT_PORT;

  daemonLog('Starting TDLib proxy...');

  const { startProxy } = await import('@tg/protocol/proxy');

  // In compiled binary, getTdjson() won't find node_modules.
  // Search multiple locations: ~/.local/lib/, relative to binary, etc.
  const tdjson = findTdjsonPath() ?? undefined;

  let shuttingDown = false;
  const proxy = await startProxy({
    authToken: getDaemonToken(),
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      daemonLog('Idle timeout reached, shutting down');
      void shutdown();
    },
    apiId: credentials.apiId,
    apiHash: credentials.apiHash,
    port,
    tdjson,
  });

  writeFileSync(PORT_FILE, String(proxy.port));
  releaseStartup();
  daemonLog(`Daemon ready (PID ${process.pid}, port ${proxy.port})`);

  // Try to log username
  try {
    // biome-ignore lint/suspicious/noExplicitAny: Invoke type workaround
    const me = await proxy.client.invoke({ _: 'getMe' } as any);
    const user = me as {
      usernames?: { editable_username?: string; active_usernames?: string[] };
      id: number;
    };
    const username =
      user.usernames?.editable_username ?? user.usernames?.active_usernames?.[0] ?? String(user.id);
    daemonLog(`Logged in as: ${username}`);
  } catch {
    daemonLog('Not yet authorized (waiting for auth flow via HTTP)');
  }

  // --- Graceful shutdown ---

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    daemonLog('Shutting down...');

    try {
      await proxy.stop();
    } catch {
      // Best effort
    }

    cleanupFiles();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown());
  process.on('SIGTERM', () => shutdown());
  process.on('SIGHUP', () => shutdown());

  process.on('uncaughtException', (err) => {
    daemonLog(`Uncaught exception: ${err.message}`);
    cleanupFiles();
    process.exit(1);
  });

  process.on('unhandledRejection', (err: unknown) => {
    daemonLog(`Unhandled rejection: ${(err as Error)?.message ?? err}`);
    cleanupFiles();
    process.exit(1);
  });

  process.on('exit', cleanupFiles);

  // Keep alive — Bun.serve keeps the event loop running
  await new Promise<never>(() => {});
}
