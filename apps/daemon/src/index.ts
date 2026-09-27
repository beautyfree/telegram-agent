/**
 * Daemon entry point — thin process wrapper around @tg/protocol/proxy.
 *
 * Responsibilities:
 *   1. PID/port file management
 *   2. Load credentials
 *   3. Start proxy via @tg/protocol/proxy
 *   4. Idle timeout (10 min, deferred if SSE connections active)
 *   5. Signal handlers (SIGINT, SIGTERM, SIGHUP → graceful shutdown)
 *   6. Crash handlers (uncaughtException, unhandledRejection)
 *   7. Log lifecycle events
 */

import { acquireAccountLocks } from '@tg/protocol/account-lock';
import { requireAccount, selectedAccount } from '@tg/protocol/accounts';

import { startProxy } from '@tg/protocol/proxy';
import { ensurePrivateDirectory, getDaemonToken } from '@tg/protocol/security';
import { APP_DIR, DEFAULT_PORT, IDLE_TIMEOUT_MS, loadCredentials } from './config';
import { log } from './logger';
import { cleanStalePid, cleanupFiles, writePid, writePort } from './pid';

let ownsPid = false;

async function startDaemon(): Promise<void> {
  const account = selectedAccount();
  const releaseStartup = acquireAccountLocks([account]);
  requireAccount(account);
  ensurePrivateDirectory(APP_DIR);
  cleanStalePid();
  writePid();
  ownsPid = true;

  const credentials = loadCredentials();
  log(`API credentials loaded (ID: ${credentials.apiId})`);

  const port = Number(process.env.TG_DAEMON_PORT) || DEFAULT_PORT;

  log('Starting TDLib proxy...');
  let shuttingDown = false;
  const proxy = await startProxy({
    authToken: getDaemonToken(),
    idleTimeoutMs: IDLE_TIMEOUT_MS,
    onIdle: () => {
      log('Idle timeout reached, shutting down');
      void shutdown();
    },
    apiId: credentials.apiId,
    apiHash: credentials.apiHash,
    port,
  });

  writePort(proxy.port);
  releaseStartup();
  log(`Daemon ready (PID ${process.pid}, port ${proxy.port})`);

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
    log(`Logged in as: ${username}`);
  } catch {
    log('Not yet authorized (waiting for auth flow via HTTP)');
  }

  // --- Graceful shutdown ---

  async function shutdown(): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    log('Shutting down...');

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
    log(`Uncaught exception: ${err.message}`);
    cleanupFiles();
    process.exit(1);
  });

  process.on('unhandledRejection', (err: unknown) => {
    log(`Unhandled rejection: ${(err as Error)?.message ?? err}`);
    cleanupFiles();
    process.exit(1);
  });

  process.on('exit', cleanupFiles);
}

startDaemon().catch((e) => {
  console.error(`Fatal: ${(e as Error).message}`);
  if (ownsPid) cleanupFiles();
  process.exit(1);
});
