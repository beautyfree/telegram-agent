import { describe, expect, test } from 'bun:test';
import { normalizeNegativePeerSeparatorArgv } from '../../src/argv';

describe('normalizeNegativePeerSeparatorArgv', () => {
  test('rewrites separator form for negative peer ids', () => {
    expect(
      normalizeNegativePeerSeparatorArgv([
        'msg',
        'list',
        '--',
        '-1002314812432',
        '--limit',
        '5',
        '--offset-id',
        '893',
      ]),
    ).toEqual(['msg', 'list', '-1002314812432', '--limit', '5', '--offset-id', '893']);
  });

  test('leaves regular argv untouched', () => {
    const argv = ['msg', 'list', '--limit', '5', '-1002314812432', '--offset-id', '893'];
    expect(normalizeNegativePeerSeparatorArgv(argv)).toEqual(argv);
  });

  test('keeps plain separator semantics for non-negative-id payloads', () => {
    const argv = ['eval', '--', 'console.log("--hello")'];
    expect(normalizeNegativePeerSeparatorArgv(argv)).toEqual(argv);
  });
});
