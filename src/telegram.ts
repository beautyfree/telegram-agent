import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { Api, TelegramClient } from 'telegram';
import { computeCheck } from 'telegram/Password.js';
import { logger } from './logger.js';
import { FileSession } from './session.js';
import {
  type AccountRecord,
  deleteAccount,
  getAccount,
  getStoredCredentials,
  sessionsDir,
  upsertAccount,
} from './state.js';

export type CredentialsSource = 'env' | 'stored' | 'missing';

const EMBEDDED_API_CREDENTIALS = {
  api_id: '45139',
  api_hash: '7e55cea996fe1d94d6d22105258e3579',
} as const;

export function credentialsStatus(): { source: CredentialsSource; api_id_masked?: string } {
  const envId = process.env.TELEGRAM_API_ID;
  const envHash = process.env.TELEGRAM_API_HASH;
  if (envId && envHash) return { source: 'env', api_id_masked: mask(envId) };
  const stored = getStoredCredentials();
  if (stored) return { source: 'stored', api_id_masked: mask(stored.api_id) };
  return { source: 'missing', api_id_masked: mask(EMBEDDED_API_CREDENTIALS.api_id) };
}

function mask(s: string): string {
  if (s.length <= 4) return '*'.repeat(s.length);
  return `${s.slice(0, 2)}${'*'.repeat(Math.max(s.length - 4, 1))}${s.slice(-2)}`;
}

function apiCreds(): { apiId: number; apiHash: string } {
  const envId = process.env.TELEGRAM_API_ID;
  const envHash = process.env.TELEGRAM_API_HASH;
  if (envId && envHash) return { apiId: parseInt(envId, 10), apiHash: envHash };
  const stored = getStoredCredentials();
  if (stored) return { apiId: parseInt(stored.api_id, 10), apiHash: stored.api_hash };
  return {
    apiId: parseInt(EMBEDDED_API_CREDENTIALS.api_id, 10),
    apiHash: EMBEDDED_API_CREDENTIALS.api_hash,
  };
}

function sessionPathFor(accountId: string): string {
  const dir = join(sessionsDir, accountId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

const clientCache = new Map<string, TelegramClient>();

export class TelegramAuthError extends Error {
  constructor(
    public accountId: string,
    message: string,
  ) {
    super(message);
    this.name = 'TelegramAuthError';
  }
}

export async function clientForAccount(accountId: string): Promise<TelegramClient> {
  const cached = clientCache.get(accountId);
  if (cached) return cached;

  const { apiId, apiHash } = apiCreds();
  const session = new FileSession(sessionPathFor(accountId));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 5 });
  await client.connect();

  if (!(await client.isUserAuthorized())) {
    clientCache.delete(accountId);
    throw new TelegramAuthError(accountId, `Telegram session expired for account ${accountId}`);
  }
  clientCache.set(accountId, client);
  return client;
}

export async function logoutAccount(accountId: string): Promise<void> {
  try {
    const client = await clientForAccount(accountId);
    await client.invoke(new Api.auth.LogOut());
  } catch (err) {
    logger.warn(`Logout RPC failed for ${accountId}: ${(err as Error).message}`);
  }
  clientCache.delete(accountId);
  deleteAccount(accountId);
}

/**
 * In-memory login state machine — one entry per browser tab driving the
 * auth flow.
 */
interface PendingLogin {
  phone: string;
  client: TelegramClient;
  phoneCodeHash?: string;
  passwordSrp?: Api.account.Password;
}

const pending = new Map<string, PendingLogin>();

export interface LoginCodeDeliveryHint {
  type: string;
  nextType?: string;
  timeoutSec?: number;
  length?: number;
}

function normalizeSentCodeKind(value: unknown): string {
  const raw =
    ((value as any)?.className as string | undefined) ||
    ((value as any)?.constructor?.name as string | undefined) ||
    '';
  const normalized = raw.replace(/^auth[._]/i, '').replace(/^SentCodeType/i, '').replace(/^CodeType/i, '');
  switch (normalized.toLowerCase()) {
    case 'app':
      return 'telegram_app';
    case 'sms':
      return 'sms';
    case 'call':
      return 'call';
    case 'flashcall':
      return 'flash_call';
    case 'missedcall':
      return 'missed_call';
    case 'emailcode':
      return 'email';
    case 'setupemailrequired':
      return 'setup_email_required';
    case 'fragmentsms':
      return 'fragment_sms';
    case 'firebasesms':
      return 'firebase_sms';
    case 'smsword':
      return 'sms_word';
    case 'smsphrase':
      return 'sms_phrase';
    default:
      return normalized ? normalized.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase() : 'unknown';
  }
}

export function normalizeSentCodeDelivery(result: {
  type?: unknown;
  nextType?: unknown;
  timeout?: number;
  isCodeViaApp?: boolean;
}): LoginCodeDeliveryHint {
  const hint: LoginCodeDeliveryHint = {
    type: result.isCodeViaApp ? 'telegram_app' : normalizeSentCodeKind(result.type),
  };
  const length = typeof (result.type as any)?.length === 'number' ? (result.type as any).length : undefined;
  if (length != null) hint.length = length;
  if (typeof result.timeout === 'number') hint.timeoutSec = result.timeout;
  if (result.nextType) hint.nextType = normalizeSentCodeKind(result.nextType);
  return hint;
}

export async function loginStart(authId: string, phone: string): Promise<LoginCodeDeliveryHint> {
  const { apiId, apiHash } = apiCreds();
  const session = new FileSession(join(sessionsDir, `_pending_${authId}`));
  const client = new TelegramClient(session, apiId, apiHash, { connectionRetries: 3 });
  await client.connect();
  const result = await client.sendCode({ apiId, apiHash }, phone);
  pending.set(authId, { phone, client, phoneCodeHash: result.phoneCodeHash });
  return normalizeSentCodeDelivery(result as any);
}

export type LoginCodeResult = { status: 'ok'; account: AccountRecord } | { status: 'password_needed' };

export async function loginSubmitCode(authId: string, code: string): Promise<LoginCodeResult> {
  const entry = pending.get(authId);
  if (!entry?.phoneCodeHash) throw new Error('Login session not found');
  try {
    await entry.client.invoke(
      new Api.auth.SignIn({
        phoneNumber: entry.phone,
        phoneCodeHash: entry.phoneCodeHash,
        phoneCode: code,
      }),
    );
    const account = await finalizeLogin(authId, entry);
    pending.delete(authId);
    return { status: 'ok', account };
  } catch (err) {
    if ((err as any).errorMessage === 'SESSION_PASSWORD_NEEDED') {
      entry.passwordSrp = await entry.client.invoke(new Api.account.GetPassword());
      return { status: 'password_needed' };
    }
    throw err;
  }
}

export async function loginSubmitPassword(authId: string, password: string): Promise<{ account: AccountRecord }> {
  const entry = pending.get(authId);
  if (!entry?.passwordSrp) throw new Error('No password challenge for this session');
  const passSrpCheck = await computeCheck(entry.passwordSrp, password);
  await entry.client.invoke(new Api.auth.CheckPassword({ password: passSrpCheck }));
  const account = await finalizeLogin(authId, entry);
  pending.delete(authId);
  return { account };
}

async function finalizeLogin(authId: string, entry: PendingLogin): Promise<AccountRecord> {
  const me = await entry.client.getMe();
  const telegramId = (me as any)?.id?.toString();
  const username = (me as any)?.username as string | undefined;
  const accountId = telegramId || `acct_${Date.now()}`;

  // Promote the pending session to its permanent location.
  const finalDir = sessionPathFor(accountId);
  const { apiId, apiHash } = apiCreds();
  const finalSession = new FileSession(finalDir);
  await finalSession.load();
  const src = entry.client.session as any;
  (finalSession as any).setDC?.(src.dcId, src.serverAddress, src.port);
  (finalSession as any).setAuthKey?.(src.authKey);
  await finalSession.save();

  await entry.client.disconnect();

  const promoted = new TelegramClient(finalSession, apiId, apiHash, { connectionRetries: 5 });
  await promoted.connect();
  clientCache.set(accountId, promoted);

  void authId; // pending dir is left on disk; harmless, can be GC'd later
  return upsertAccount({ id: accountId, phone: entry.phone, username, telegram_id: telegramId });
}

export function getAccountSafe(id: string): AccountRecord | undefined {
  return getAccount(id);
}
