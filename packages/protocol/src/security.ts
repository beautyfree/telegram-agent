import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  closeSync,
  constants,
  fchmodSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { APP_DIR } from './paths';
import { ensurePrivateDirectory } from './storage';

export { ensurePrivateDirectory } from './storage';

export const DAEMON_HOST = '127.0.0.1';
export const PROTOCOL_VERSION = '1';
export const PROTOCOL_HEADER = 'X-Telegram-Agent-Protocol';

/** Publish a complete token atomically, including when CLI processes start concurrently. */
export function getDaemonToken(directory = APP_DIR): string {
  ensurePrivateDirectory(directory);
  const tokenPath = path.join(directory, 'daemon.token');
  try {
    lstatSync(tokenPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    const temporary = path.join(directory, `.daemon-token-${randomBytes(16).toString('hex')}`);
    writeFileSync(temporary, randomBytes(32).toString('hex'), { mode: 0o600, flag: 'wx' });
    try {
      try {
        linkSync(temporary, tokenPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      }
    } finally {
      unlinkSync(temporary);
    }
  }
  // Refuse symlinks rather than reading another user's token or changing its permissions.
  if (lstatSync(tokenPath).isSymbolicLink()) throw new Error('Daemon token must not be a symlink');
  const fd = openSync(tokenPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile() || (process.getuid && stat.uid !== process.getuid())) {
      throw new Error('Daemon token must be a private regular file owned by the current user');
    }
    if (process.platform !== 'win32') fchmodSync(fd, 0o600);
    const token = readFileSync(fd, 'utf8').trim();
    if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid daemon token file');
    return token;
  } finally {
    closeSync(fd);
  }
}

export function daemonUrl(port: number): string {
  return `http://${DAEMON_HOST}:${port}`;
}

export function authorizationHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}` };
}

/** This is a CLI-only API. Browser origins and non-loopback Host values are never allowed. */
export function authorizeRequest(req: Request, port: number, token: string): Response | null {
  const host = req.headers.get('host');
  if (
    ![`${DAEMON_HOST}:${port}`, `localhost:${port}`].includes(host ?? '') ||
    req.headers.has('origin') ||
    req.headers.has('sec-fetch-site')
  ) {
    return new Response('Forbidden', { status: 403 });
  }
  const expected = Buffer.from(`Bearer ${token}`);
  const supplied = Buffer.from(req.headers.get('authorization') ?? '');
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}

/** Refuse an old daemon instead of silently talking to its unauthenticated API. */
export function requireSecureDaemon(response: Response): void {
  if (!response.ok || response.headers.get(PROTOCOL_HEADER) !== PROTOCOL_VERSION) {
    throw new Error(
      'Daemon authentication failed or an older daemon is running. Before upgrading, use the OLD CLI ' +
        "to run `telegram-agent daemon stop`. If already upgraded, inspect the selected account's " +
        'tg_daemon.pid / caption.pid, verify the process identity in your OS process manager, ' +
        'and stop that verified process manually. Do not blindly signal a saved PID. ' +
        'Then retry with the updated CLI; see SECURITY.md for upgrade recovery.',
    );
  }
}

/** Resolve only regular media files inside the media root, including through symlinks. */
export function resolveMediaPath(directory: string, relativePath: string): string | null {
  try {
    const root = realpathSync(directory);
    const target = realpathSync(path.resolve(root, relativePath));
    const relative = path.relative(root, target);
    if (
      !relative ||
      relative === '..' ||
      relative.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relative)
    ) {
      return null;
    }
    return statSync(target).isFile() ? target : null;
  } catch {
    return null;
  }
}

/** Shared by both daemons so neither can accidentally expose an unauthenticated listener. */
export function serveLocal(options: {
  port: number;
  authToken: string;
  fetch: (req: Request) => Response | Promise<Response>;
}) {
  if (!/^[a-f0-9]{64}$/.test(options.authToken)) {
    throw new Error('A daemon authentication token is required');
  }
  return Bun.serve({
    hostname: DAEMON_HOST,
    port: options.port,
    fetch(req, server) {
      const denied = authorizeRequest(req, server.port ?? options.port, options.authToken);
      return denied ?? options.fetch(req);
    },
  });
}
