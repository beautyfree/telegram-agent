import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import QRCode from 'qrcode';
import { TelegramClient } from 'telegram';

import { renderAuthPage } from './auth-page.js';
import { logger } from './logger.js';
import { type AccountRecord, listAccounts, setStoredCredentials } from './state.js';
import { FileSession } from './session.js';
import {
  clientForAccount,
  credentialsStatus,
  finalizeAuthorizedClient,
  getApiCredentials,
  type LoginCodeDeliveryHint,
  loginStart,
  loginResendCode,
  loginSubmitCode,
  loginSubmitPassword,
  TelegramAuthError,
} from './telegram.js';

function loadPkgMeta(): { name: string; version: string; repoUrl?: string } {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(join(here, '..', 'package.json'), 'utf-8'));
    let repoUrl: string | undefined = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
    if (repoUrl) {
      repoUrl = repoUrl.replace(/^git\+/, '').replace(/\.git$/, '');
    }
    return { name: pkg.name, version: pkg.version, repoUrl };
  } catch {
    return { name: 'telegram-agent', version: '0.0.0' };
  }
}

const pkgMeta = loadPkgMeta();

type QrStatus = 'idle' | 'waiting_scan' | 'password_needed' | 'authorized' | 'error';

interface PendingQrLogin {
  status: QrStatus;
  qrUrl?: string;
  qrImage?: string;
  expiresAt?: number;
  passwordHint?: string;
  error?: string;
  account?: AccountRecord;
  startPromise?: Promise<AccountRecord>;
  passwordResolver?: (password: string) => void;
}

/**
 * Run a one-shot login flow in the browser.
 *
 * Spins up an ephemeral HTTP server on 127.0.0.1, opens the default
 * browser to the local auth page, drives the Telegram phone/code/2FA
 * flow against it, and resolves once the user finishes (or rejects on
 * timeout / explicit cancel).
 */
export function runBrowserLogin(opts: { timeoutMs?: number } = {}): Promise<AccountRecord> {
  const timeoutMs = opts.timeoutMs ?? 10 * 60_000;
  const authId = randomBytes(16).toString('base64url');
  const qrLogin: PendingQrLogin = { status: 'idle' };

  return new Promise<AccountRecord>((resolve, reject) => {
    let serverClosed = false;
    let promiseSettled = false;

    /**
     * Resolve/reject the runBrowserLogin promise.
     *
     * Decoupled from shutdown — once the user finishes auth, the agent
     * can proceed immediately, but the HTTP server keeps running so the
     * user can dismiss the tab cleanly.
     */
    const settlePromise = (fn: () => void) => {
      if (promiseSettled) return;
      promiseSettled = true;
      fn();
    };

    const shutdown = () => {
      if (serverClosed) return;
      serverClosed = true;
      clearTimeout(timer);
      server.close();
    };

    const server = createServer(async (req, res) => {
      try {
        await route(req, res);
      } catch (err) {
        logger.error('auth-browser handler crashed', err);
        sendJson(res, 500, { error: (err as Error).message });
      }
    });

    const timer = setTimeout(() => {
      settlePromise(() => reject(new Error('Login timed out')));
      shutdown();
    }, timeoutMs);

    server.listen(0, '127.0.0.1', async () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        return settlePromise(() => reject(new Error('Failed to obtain a local port')));
      }
      const baseUrl = `http://127.0.0.1:${address.port}`;
      const authUrl = `${baseUrl}/`;
      logger.info(`Opening browser for Telegram login: ${authUrl}`);
      try {
        await open(authUrl);
      } catch (_err) {
        logger.warn(`Failed to auto-open the browser. Open this URL manually: ${authUrl}`);
      }
    });

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    async function ensureQrLoginStarted(): Promise<PendingQrLogin> {
      if (qrLogin.startPromise) return qrLogin;
      qrLogin.status = 'waiting_scan';
      qrLogin.startPromise = (async () => {
        const { apiId, apiHash } = getApiCredentials();
        const session = new FileSession(join(process.env.HOME || '', '.telegram-agent', 'sessions', `_pending_qr_${authId}`));
        const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
        await client.connect();
        try {
          const user = await client.signInUserWithQrCode(
            { apiId, apiHash },
            {
              qrCode: async ({ token, expires }) => {
                const qrUrl = `tg://login?token=${token.toString('base64url')}`;
                qrLogin.qrUrl = qrUrl;
                qrLogin.qrImage = await QRCode.toDataURL(qrUrl, {
                  errorCorrectionLevel: 'M',
                  margin: 1,
                  width: 264,
                  color: { dark: '#111827', light: '#ffffff' },
                });
                qrLogin.expiresAt = typeof expires === 'number' ? expires * 1000 : Date.now() + 30_000;
                qrLogin.status = 'waiting_scan';
              },
              password: async (hint?: string) => {
                qrLogin.status = 'password_needed';
                qrLogin.passwordHint = hint || undefined;
                return await new Promise<string>((resolvePassword) => {
                  qrLogin.passwordResolver = resolvePassword;
                });
              },
              onError: async (err) => {
                qrLogin.error = err.message;
                qrLogin.status = 'error';
                return true;
              },
            },
          );
          const account = await finalizeAuthorizedClient(client, (user as any)?.phone);
          qrLogin.account = account;
          qrLogin.status = 'authorized';
          settlePromise(() => resolve(account));
          return account;
        } catch (err) {
          qrLogin.error = (err as Error).message;
          qrLogin.status = 'error';
          throw err;
        }
      })();

      for (let i = 0; i < 20; i++) {
        if (qrLogin.qrImage || qrLogin.error) break;
        await sleep(100);
      }
      return qrLogin;
    }

    async function route(req: IncomingMessage, res: ServerResponse) {
      const url = new URL(req.url || '/', 'http://127.0.0.1');

      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/authorize')) {
        const accounts = listAccounts().map((a) => ({ id: a.id, phone: a.phone, username: a.username }));
        const creds = credentialsStatus();
        const env = {
          TELEGRAM_API_ID: process.env.TELEGRAM_API_ID,
          TELEGRAM_API_HASH: process.env.TELEGRAM_API_HASH,
          TELEGRAM_AGENT_HOME: process.env.TELEGRAM_AGENT_HOME,
          LOG_LEVEL: process.env.LOG_LEVEL,
        };
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        return res.end(renderAuthPage(authId, accounts, creds, env, pkgMeta));
      }

      if (req.method === 'GET' && url.pathname === '/logo.png') {
        try {
          const here = dirname(fileURLToPath(import.meta.url));
          const logo = readFileSync(join(here, '..', 'assets', 'logo.png'));
          res.writeHead(200, { 'content-type': 'image/png', 'cache-control': 'max-age=3600' });
          return res.end(logo);
        } catch {
          return sendJson(res, 404, { error: 'logo not found' });
        }
      }

      if (req.method !== 'POST') {
        return sendJson(res, 404, { error: 'not_found' });
      }

      const body = await readJsonBody(req);
      if (body.auth_id !== authId) {
        return sendJson(res, 400, { error: 'invalid_session' });
      }

      if (url.pathname === '/authorize/save-credentials') {
        const status = credentialsStatus();
        if (status.source === 'env') {
          return sendJson(res, 400, {
            error:
              'TELEGRAM_API_ID/TELEGRAM_API_HASH are set in the environment and take precedence. Unset them to edit here.',
          });
        }
        const api_id = String(body.api_id || '').trim();
        const api_hash = String(body.api_hash || '').trim();
        if (!/^\d+$/.test(api_id)) return sendJson(res, 400, { error: 'api_id must be numeric' });
        if (api_hash.length < 16) return sendJson(res, 400, { error: 'api_hash looks too short' });
        setStoredCredentials({ api_id, api_hash });
        return sendJson(res, 200, { ok: true });
      }

      if (url.pathname === '/authorize/login-start') {
        if (!body.phone) return sendJson(res, 400, { error: 'phone is required' });
        try {
          const delivery = await loginStart(authId, String(body.phone));
          return sendJson(res, 200, { ok: true, delivery });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-code') {
        if (!body.code) return sendJson(res, 400, { error: 'code is required' });
        try {
          const result = await loginSubmitCode(authId, String(body.code));
          if (result.status === 'password_needed') {
            return sendJson(res, 200, { status: 'password_needed', passwordHint: result.passwordHint });
          }
          settlePromise(() => resolve(result.account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-resend') {
        try {
          const delivery = await loginResendCode(authId);
          return sendJson(res, 200, { ok: true, delivery });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/login-password') {
        if (!body.password) return sendJson(res, 400, { error: 'password is required' });
        try {
          if (qrLogin.status === 'password_needed' && qrLogin.passwordResolver) {
            qrLogin.passwordResolver(String(body.password));
            qrLogin.passwordResolver = undefined;
            const account = qrLogin.startPromise ? await qrLogin.startPromise : undefined;
            if (!account) throw new Error('QR login not started');
            settlePromise(() => resolve(account));
            return sendJson(res, 200, { redirect: '/done' });
          }
          const { account } = await loginSubmitPassword(authId, String(body.password));
          settlePromise(() => resolve(account));
          return sendJson(res, 200, { redirect: '/done' });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/qr-start') {
        try {
          await ensureQrLoginStarted();
          return sendJson(res, 200, {
            status: qrLogin.status,
            qrImage: qrLogin.qrImage,
            expiresAt: qrLogin.expiresAt,
            passwordHint: qrLogin.passwordHint,
            error: qrLogin.error,
          });
        } catch (err) {
          return sendJson(res, 400, { error: (err as Error).message });
        }
      }

      if (url.pathname === '/authorize/qr-status') {
        return sendJson(res, 200, {
          status: qrLogin.status,
          qrImage: qrLogin.qrImage,
          expiresAt: qrLogin.expiresAt,
          passwordHint: qrLogin.passwordHint,
          error: qrLogin.error,
        });
      }

      if (url.pathname === '/authorize/use-account') {
        const id = String(body.account_id || '');
        const account = listAccounts().find((a) => a.id === id);
        if (!account) return sendJson(res, 404, { error: 'account not found' });
        try {
          const client = await clientForAccount(id);
          await client.getMe();
        } catch (err) {
          if (err instanceof TelegramAuthError) {
            return sendJson(res, 401, {
              error: 'session_expired',
              phone: account.phone,
              username: account.username,
            });
          }
          return sendJson(res, 500, { error: (err as Error).message });
        }
        settlePromise(() => resolve(account));
        return sendJson(res, 200, { redirect: '/done' });
      }

      if (url.pathname === '/authorize/close') {
        sendJson(res, 200, { ok: true });
        // Give the response a moment to flush before we tear down.
        setTimeout(shutdown, 200);
        return;
      }

      return sendJson(res, 404, { error: 'not_found' });
    }
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return {};
  }
}
