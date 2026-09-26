import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { readAccountMetadata, requireAccount, selectedAccount } from '@tg/protocol/accounts';
import {
  authorizationHeaders,
  daemonUrl,
  getDaemonToken,
  requireSecureDaemon,
} from '@tg/protocol/security';

export function serviceState(directory: string, service: 'tg_daemon' | 'caption') {
  let pid: number | null = null;
  let port: number | null = null;
  try {
    const value = Number(readFileSync(path.join(directory, `${service}.pid`), 'utf8').trim());
    if (Number.isInteger(value) && value > 0) {
      process.kill(value, 0);
      pid = value;
    }
  } catch {
    /* Missing or stale PID. */
  }
  try {
    const value = Number(readFileSync(path.join(directory, `${service}.port`), 'utf8').trim());
    if (Number.isInteger(value) && value > 0 && value <= 65535) port = value;
  } catch {
    /* Not started. */
  }
  return { running: pid !== null, pid, port };
}

export function describeAccount(name: string) {
  const directory = requireAccount(name);
  return {
    name,
    directory,
    ...readAccountMetadata(name),
    // Presence is not proof of authorization; use `me` or `accounts status` to verify.
    hasSession: existsSync(path.join(directory, 'tdlib_db')),
    daemon: serviceState(directory, 'tg_daemon'),
    caption: serviceState(directory, 'caption'),
  };
}

export async function accountAuthState(name: string): Promise<unknown> {
  const directory = requireAccount(name);
  const state = serviceState(directory, 'tg_daemon');
  if (!state.running || !state.port) return { state: 'not_running', ready: false };
  const headers = authorizationHeaders(getDaemonToken(directory));
  const health = await fetch(`${daemonUrl(state.port)}/health`, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(2000),
  });
  requireSecureDaemon(health);
  const response = await fetch(`${daemonUrl(state.port)}/api/tg/auth/state`, {
    headers,
    redirect: 'error',
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok)
    throw new Error(`Cannot read account authorization state (HTTP ${response.status})`);
  const result = (await response.json()) as { ok: boolean; data: unknown };
  if (!result.ok) throw new Error('Cannot read account authorization state');
  return result.data;
}

export async function stopAccountServices(
  name = selectedAccount(),
  services: ('tg_daemon' | 'caption')[] = ['tg_daemon', 'caption'],
): Promise<void> {
  const directory = requireAccount(name);
  for (const service of services) {
    const state = serviceState(directory, service);
    if (!state.running || !state.pid) continue;
    if (!state.port)
      throw new Error(
        `Cannot verify the ${service} process for account "${name}"; stop it before retrying`,
      );
    const response = await fetch(`${daemonUrl(state.port)}/health`, {
      headers: authorizationHeaders(getDaemonToken(directory)),
      redirect: 'error',
      signal: AbortSignal.timeout(2000),
    });
    requireSecureDaemon(response);
    const health = (await response.json()) as { pid?: number };
    if (health.pid !== state.pid)
      throw new Error(`Refusing to stop an unverified process for account "${name}"`);
    process.kill(state.pid, 'SIGTERM');
    const deadline = Date.now() + 5000;
    while (serviceState(directory, service).running) {
      if (Date.now() >= deadline)
        throw new Error(
          `The ${service} process for account "${name}" has not stopped; no files were removed`,
        );
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

export function accountCommandArgs(name: string, args: string[]): string[] {
  const script = process.argv[1];
  const prefix =
    script?.endsWith('.ts') || script?.endsWith('.js')
      ? [process.execPath, script]
      : [process.execPath];
  return [...prefix, '--account', name, ...args];
}

export async function runAccountCommand(
  name: string,
  args: string[],
  quiet = false,
): Promise<void> {
  const child = Bun.spawn(accountCommandArgs(name, args), {
    stdio: ['inherit', quiet ? 'ignore' : 'inherit', 'inherit'],
    env: { ...process.env, TG_ACCOUNT: name },
  });
  const status = await child.exited;
  if (status !== 0)
    throw new Error(
      `Command failed for account "${name}" (exit ${status}); the profile is retained so you can retry`,
    );
}
