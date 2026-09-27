import { expect, test } from 'bun:test';
import { stripVTControlCharacters } from 'node:util';
import { prettyEvent, prettyResult, terminalText } from '../../src/pretty';
import { glyphs, supportsOutputColor } from '../../src/terminal-theme';

const success = (data: unknown, width = 100) =>
  prettyResult({ ok: true, account: 'work', data }, { width });

test('flat lists use aligned tables and keep numeric identifiers unchanged', () => {
  const out = success([
    { id: -1001234567890, title: 'Team', unread: 0 },
    { id: 42, title: '设计 👩‍💻', unread: 7 },
  ]);
  expect(out).toContain('ID');
  expect(out).toContain('Title');
  expect(out).toContain('Unread');
  expect(out).toContain('-1001234567890');
  expect(out).toContain('设计 👩‍💻');
  expect(out).toContain('─');
  const rows = out
    .split('\n')
    .filter((line) => line.includes('-1001234567890') || line.includes('设计 👩‍💻'));
  expect(rows).toHaveLength(2);
  expect(Bun.stringWidth(rows[0] ?? '')).toBe(Bun.stringWidth(rows[1] ?? ''));
});

test('nested details retain false, zero, null, empty strings and big integers', () => {
  const out = success({
    count: 0,
    running: false,
    enabled: true,
    username: null,
    label: '',
    customEmojiId: 9007199254740993n,
    details: { status: 'ready' },
  });
  for (const text of [
    'Count: 0',
    'Running: No',
    'Enabled: Yes',
    'Username: —',
    'Label: (empty)',
    'Custom Emoji ID: 9007199254740993',
    'Details:',
    'Status: ready',
  ])
    expect(out).toContain(text);
});

test('messages use readable details rather than flattening text into table cells', () => {
  const out = success([
    {
      id: 99,
      name: 'Alice',
      date: '2026-09-27 12:00',
      text: 'First line\nSecond line',
      doc: '/tmp/document.pdf',
      buttons: [[{ id: 1, text: 'Open', url: 'https://example.com' }]],
    },
  ]);
  for (const text of [
    'ID: 99',
    'Name: Alice',
    'First line',
    'Second line',
    'Doc: /tmp/document.pdf',
    'https://example.com',
  ])
    expect(out).toContain(text);
  expect(out).not.toContain('[object Object]');
});

test('pagination and empty lists are explicit, including a zero cursor', () => {
  const out = prettyResult({ ok: true, account: 'work', data: [], hasMore: false, nextOffset: 0 });
  expect(out).toContain('No results.');
  expect(out).toContain('More results: No');
  expect(out).toContain('Next offset: 0');
  expect(success(undefined)).toContain('Done.');
});

test('narrow terminals switch to details, wrap full text and do not split grapheme clusters', () => {
  const text = 'Hello from the team. 设计 👩‍💻 e\u0301 family 👨‍👩‍👧‍👦 with a long final sentence.';
  const out = success(
    [{ id: 123, title: text, description: text, member_count: 500, last_date: '2026-09-27' }],
    32,
  );
  expect(out).toContain('ID: 123');
  expect(out).toContain('👩‍💻');
  expect(out).toContain('e\u0301');
  expect(out).toContain('👨‍👩‍👧‍👦');
  expect(out).toContain('sentence.');
  for (const line of out.split('\n')) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(32);
});

test('long identifiers and URLs are wrapped without truncation', () => {
  const url = 'https://example.com/path/to/a/very-long-document?key=abcdefghijklmnopqrstuvwxyz';
  const out = success({ url }, 24);
  const content =
    out
      .split('\n')
      .map((line) => (line.startsWith(`${glyphs.bar}  `) ? line.slice(3) : ''))
      .join('\n')
      .split('Url:\n')[1] ?? '';
  expect(content.replace(/\s/g, '')).toBe(url);
  for (const line of out.split('\n')) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(24);
});

test('account overview distinguishes selection, saved default, session and services', () => {
  const out = prettyResult(
    {
      ok: true,
      account: 'work',
      data: {
        active: 'default',
        selected: 'work',
        accounts: [
          {
            name: 'work',
            hasSession: true,
            identity: { id: 42, firstName: 'Alice' },
            daemon: { running: true, port: 34567 },
            caption: { running: false },
          },
        ],
      },
    },
    { command: 'accounts list' },
  );
  for (const value of [
    'Selected: work',
    'Saved default: default',
    'Alice',
    '42',
    'Stored',
    ':34567',
    'Stopped',
    'accounts status <name>',
  ])
    expect(out).toContain(value);
});

test('untrusted terminal controls are neutralized in values, keys and errors', () => {
  const hostile = '\u001b[2Jsecret\u001b]52;c;ZXZpbA==\u0007\r\b\u202eevil';
  const out = success({ [hostile]: hostile });
  expect(out).not.toContain('\u001b');
  expect(out).not.toContain('\u0007');
  expect(out).not.toContain('\r');
  expect(out).not.toContain('\u202e');
  expect(out).toContain('secret');
  expect(out).not.toContain('ZXZpbA==');
  expect(prettyResult({ ok: false, error: hostile, code: 'PERMISSION' })).toContain(
    'Error · PERMISSION',
  );
  expect(terminalText('hello\nworld')).toBe('hello\nworld');
});

test('streamed events carry a heading, account and complete nested event data', () => {
  const out = prettyEvent({
    account: 'personal',
    type: 'new_message',
    chat_id: 42,
    message: { id: 3, text: 'Hello\nworld' },
  });
  for (const value of [
    'New message',
    'Account: personal',
    'Chat ID: 42',
    'ID: 3',
    'Hello',
    'world',
  ])
    expect(out).toContain(value);
});

test('Clack frames, rounded table borders and selected markers survive without color', () => {
  const out = prettyResult(
    {
      ok: true,
      account: 'work',
      data: {
        selected: 'work',
        active: 'default',
        accounts: [
          { name: 'work', hasSession: true, daemon: { running: true, port: 12345 } },
          { name: 'personal', hasSession: false },
        ],
      },
    },
    { command: 'accounts list', color: false },
  );
  for (const glyph of [glyphs.start, glyphs.end, glyphs.topLeft, glyphs.bottomRight])
    expect(out).toContain(glyph);
  expect(out).toContain(`${glyphs.selected} work`);
  expect(out).not.toContain(`${glyphs.selected} personal`);
  expect(out).not.toContain('\u001b');
});

test('color changes presentation only, preserving display widths, Unicode and safe text', () => {
  const result = {
    ok: true,
    account: 'work',
    data: [
      { title: '设计 👩‍💻', running: true },
      { title: '\u001b[2JHostile', running: false },
    ],
  };
  const plain = prettyResult(result, { width: 48, color: false });
  const colored = prettyResult(result, { width: 48, color: true });
  expect(colored).toContain('\u001b[36m');
  expect(colored).toContain('\u001b[32m');
  expect(colored).not.toContain('\u001b[2J');
  expect(stripVTControlCharacters(colored)).toBe(plain);
  for (const line of colored.split('\n')) expect(Bun.stringWidth(line)).toBeLessThanOrEqual(48);
  const error = prettyResult(
    { ok: false, account: 'work', code: 'PERMISSION', error: 'Refused' },
    { color: true },
  );
  expect(error).toContain('\u001b[31m');
});

test('color is enabled only on capable terminals and respects opt-outs', () => {
  expect(supportsOutputColor(true, { TERM: 'xterm-256color' })).toBe(true);
  expect(supportsOutputColor(false, { FORCE_COLOR: '1' })).toBe(false);
  for (const env of [
    { NO_COLOR: '' },
    { NO_COLOR: '1' },
    { FORCE_COLOR: '0' },
    { NODE_DISABLE_COLORS: '1' },
    { TERM: 'dumb' },
  ])
    expect(supportsOutputColor(true, env)).toBe(false);
});
