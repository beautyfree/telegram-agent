// Separate process so lifecycle tests can safely send SIGTERM. Only TDLib is mocked.
import { EventEmitter } from 'node:events';
import { appendFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { acquireAccountLocks } from '@tg/protocol/account-lock';
import { requireAccount } from '@tg/protocol/accounts';
import { ACCOUNT_NAME, APP_DIR } from '@tg/protocol/paths';
import { type ProxyOptions, startProxy } from '@tg/protocol/proxy';
import {
  getDaemonToken,
  PROTOCOL_HEADER,
  PROTOCOL_VERSION,
  serveLocal,
} from '@tg/protocol/security';

const prefix = process.env.FIXTURE_SERVICE ?? 'tg_daemon';
const client = Object.assign(new EventEmitter(), {
  async invoke(body: Record<string, unknown>) {
    appendFileSync(path.join(APP_DIR, 'calls.jsonl'), `${JSON.stringify(body)}\n`);
    if (body._ === 'logOut') {
      if (process.env.FIXTURE_LOGOUT_RECORD)
        writeFileSync(process.env.FIXTURE_LOGOUT_RECORD, ACCOUNT_NAME);
      return { _: 'ok' };
    }
    return {
      _: 'user',
      id: ACCOUNT_NAME === 'work' ? 101 : 202,
      first_name: ACCOUNT_NAME,
      type: { _: 'userTypeRegular' },
    };
  },
  async close() {},
});
const releaseStartup = acquireAccountLocks([ACCOUNT_NAME]);
requireAccount(ACCOUNT_NAME);
const authToken = getDaemonToken();
const server =
  prefix === 'tg_daemon'
    ? await startProxy({ authToken, client: client as unknown as ProxyOptions['client'] })
    : serveLocal({
        port: 0,
        authToken,
        fetch(request) {
          if (new URL(request.url).pathname === '/health')
            return Response.json(
              { ok: true, pid: process.pid },
              { headers: { [PROTOCOL_HEADER]: PROTOCOL_VERSION } },
            );
          return Response.json({ text: ACCOUNT_NAME });
        },
      });
client.emit('update', {
  _: 'updateAuthorizationState',
  authorization_state: { _: 'authorizationStateReady' },
});
// A harmless update for listener isolation checks; no Telegram traffic.
setInterval(
  () =>
    client.emit('update', {
      _: 'updateUserStatus',
      user_id: 1,
      status: { _: 'userStatusOnline', expires: 0 },
    }),
  100,
);
writeFileSync(path.join(APP_DIR, `${prefix}.pid`), String(process.pid));
writeFileSync(path.join(APP_DIR, `${prefix}.port`), String(server.port));
process.on('SIGTERM', async () => {
  if (process.env.FIXTURE_STOP_MARKER) {
    writeFileSync(process.env.FIXTURE_STOP_MARKER, 'stopping');
    await Bun.sleep(500);
  }
  await server.stop();
  unlinkSync(path.join(APP_DIR, `${prefix}.pid`));
  unlinkSync(path.join(APP_DIR, `${prefix}.port`));
  process.exit(0);
});
releaseStartup();
console.log(server.port);
