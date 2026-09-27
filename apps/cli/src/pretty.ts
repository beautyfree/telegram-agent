import { stripVTControlCharacters } from 'node:util';

export interface PrettyOptions {
  width?: number;
  command?: string;
}

type RecordValue = Record<string, unknown>;
const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const isScalar = (value: unknown): boolean => value === null || typeof value !== 'object';
const measure = (value: string): number => Bun.stringWidth(value);
const segments = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/** Message text is untrusted: never let it execute terminal escape sequences. */
export function terminalText(value: string): string {
  return stripVTControlCharacters(value)
    .replace(/\t/g, '    ')
    .replace(
      // biome-ignore lint/suspicious/noControlCharactersInRegex: escape untrusted terminal control characters
      /[\x00-\x08\x0b-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g,
      (character) => `\\u${character.charCodeAt(0).toString(16).padStart(4, '0')}`,
    );
}

function label(key: string): string {
  const words = terminalText(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ');
  return words
    .replace(/\bid\b/gi, 'ID')
    .replace(/\bpid\b/gi, 'PID')
    .replace(/^./, (c) => c.toUpperCase());
}

function scalar(value: unknown): string {
  if (value === undefined || value === null) return '—';
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (value === '') return '(empty)';
  return terminalText(String(value));
}

/** Wrap by display cells, preserving graphemes and all text (including long URLs). */
function wrap(text: string, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    let size = 0;
    for (const { segment } of segments.segment(paragraph)) {
      const cells = measure(segment);
      if (size + cells > width && line) {
        const boundary = line.lastIndexOf(' ');
        if (boundary > 0) {
          lines.push(line.slice(0, boundary));
          line = line.slice(boundary + 1);
          size = measure(line);
        } else {
          lines.push(line);
          line = '';
          size = 0;
        }
      }
      line += segment;
      size += cells;
    }
    lines.push(line);
  }
  return lines;
}

function field(key: string, value: unknown, width: number, indent: string): string[] {
  const heading = `${label(key)}:`;
  const space = width - measure(indent);
  if (isScalar(value)) {
    const text = scalar(value);
    if (!text.includes('\n') && measure(heading) + 1 + measure(text) <= space) {
      return [`${indent}${heading} ${text}`];
    }
  }
  return [
    ...wrap(heading, Math.max(1, space)).map((line) => indent + line),
    ...render(value, width, `${indent}  `),
  ];
}

/** Use a table only for short, flat records. Nested records and narrow screens use details. */
function table(rows: RecordValue[], width: number, indent: string): string[] | null {
  const keys = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  if (
    !keys.length ||
    keys.length > 6 ||
    rows.some((row) => Object.values(row).some((v) => !isScalar(v)))
  )
    return null;
  const headings = keys.map(label);
  const cells = rows.map((row) => keys.map((key) => scalar(row[key])));
  const natural = keys.map((_, i) =>
    Math.max(
      measure(headings[i] ?? ''),
      ...cells.map((row) => Math.max(...(row[i] ?? '').split('\n').map(measure))),
    ),
  );
  const minimum = natural.map((size, i) =>
    Math.max(measure(headings[i] ?? ''), Math.min(size, 12)),
  );
  const budget = width - measure(indent) - 3 * (keys.length - 1);
  if (minimum.reduce((a, b) => a + b, 0) > budget) return null;
  const widths = [...minimum];
  let remaining = budget - widths.reduce((a, b) => a + b, 0);
  while (remaining > 0 && widths.some((size, i) => size < (natural[i] ?? 0))) {
    for (let i = 0; i < widths.length && remaining > 0; i++) {
      if ((widths[i] ?? 0) < (natural[i] ?? 0)) {
        widths[i] = (widths[i] ?? 0) + 1;
        remaining--;
      }
    }
  }
  const rowLines = (row: string[]) => {
    const wrapped = row.map((cell, i) => wrap(cell, widths[i] ?? 1));
    return Array.from(
      { length: Math.max(...wrapped.map((cell) => cell.length)) },
      (_, line) =>
        indent +
        wrapped
          .map((cell, i) => {
            const text = cell[line] ?? '';
            return text + ' '.repeat(Math.max(0, (widths[i] ?? 0) - measure(text)));
          })
          .join('   ')
          .trimEnd(),
    );
  };
  return [
    ...rowLines(headings),
    indent + widths.map((size) => '─'.repeat(size)).join('   '),
    ...cells.flatMap(rowLines),
  ];
}

function isMessage(value: RecordValue): boolean {
  return (
    'date' in value &&
    ('id' in value || 'ids' in value) &&
    ('text' in value || 'content' in value || 'name' in value)
  );
}

function render(value: unknown, width: number, indentation = '', depth = 0): string[] {
  // Keep labels visible even with deeply nested TDLib results on a narrow terminal.
  const indent = indentation.slice(0, Math.max(0, width - 16));
  if (depth > 12)
    return wrap(
      '(nested data; use --json for the full result)',
      Math.max(1, width - measure(indent)),
    ).map((line) => indent + line);
  if (Array.isArray(value)) {
    if (!value.length) return [`${indent}No results.`];
    if (value.every(isRecord) && !value.some(isMessage)) {
      const rows = table(value, width, indent);
      if (rows) return rows;
    }
    return value.flatMap((item, i) => {
      if (isScalar(item))
        return wrap(scalar(item), Math.max(1, width - measure(indent) - 2)).map(
          (line, n) => `${indent}${n ? '  ' : '• '}${line}`,
        );
      return [
        ...(i ? [''] : []),
        `${indent}${i + 1}.`,
        ...render(item, width, `${indent}  `, depth + 1),
      ];
    });
  }
  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (!entries.length) return [`${indent}Done.`];
    return entries.flatMap(([key, item]) => {
      if (isScalar(item)) return field(key, item, width, indent);
      return [
        ...wrap(`${label(key)}:`, Math.max(1, width - measure(indent))).map(
          (line) => indent + line,
        ),
        ...render(item, width, `${indent}  `, depth + 1),
      ];
    });
  }
  return wrap(scalar(value), Math.max(1, width - measure(indent))).map((line) => indent + line);
}

function accountOverview(data: RecordValue): RecordValue[] | null {
  if (!Array.isArray(data.accounts) || !data.accounts.every(isRecord)) return null;
  return data.accounts.map((account) => {
    const identity = isRecord(account.identity) ? account.identity : {};
    const service = (value: unknown) =>
      isRecord(value) && value.running
        ? `Running${value.port ? ` :${value.port}` : ''}`
        : 'Stopped';
    return {
      account: account.name,
      user:
        [identity.firstName, identity.username ? `@${identity.username}` : undefined, identity.id]
          .filter((v) => v !== undefined)
          .join(' · ') || 'Not recorded',
      session: account.hasSession ? 'Stored' : 'None',
      daemon: service(account.daemon),
      caption: service(account.caption),
    };
  });
}

/** Format the existing response envelope without changing its machine-readable data. */
export function prettyResult(result: RecordValue, options: PrettyOptions = {}): string {
  const width = Math.max(16, Math.min(options.width || 100, 160));
  const title =
    result.ok === false ? `Error · ${scalar(result.code)}` : label(options.command || 'Result');
  const lines = [...wrap(title, width)];
  if (result.account !== undefined)
    lines.push(...wrap(`Account: ${scalar(result.account)}`, width));
  lines.push('');
  if (result.ok === false) {
    lines.push(...wrap(scalar(result.error), width));
  } else {
    const data = result.data;
    const overview =
      options.command === 'accounts list' && isRecord(data) ? accountOverview(data) : null;
    if (overview && isRecord(data)) {
      lines.push(
        ...field('selected', data.selected, width, ''),
        ...field('saved default', data.active, width, ''),
        '',
        ...render(overview, width),
        '',
        ...wrap('Details: accounts status <name>', width),
      );
    } else {
      lines.push(...render(data === undefined ? {} : data, width));
    }
    if (result.hasMore !== undefined || result.nextOffset !== undefined) {
      lines.push('');
      if (result.hasMore !== undefined)
        lines.push(...field('more results', result.hasMore, width, ''));
      if (result.nextOffset !== undefined)
        lines.push(...field('next offset', result.nextOffset, width, ''));
    }
  }
  return `${lines.join('\n')}\n`;
}

export function prettyEvent(event: RecordValue, options: PrettyOptions = {}): string {
  const { type, account, ...data } = event;
  return prettyResult(
    { ok: true, account, data },
    { ...options, command: typeof type === 'string' ? type : 'Event' },
  );
}
