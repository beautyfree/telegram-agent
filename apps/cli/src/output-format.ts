// This module must not import account paths: bootstrap errors use it before selection.
import { prettyEvent, prettyResult } from './pretty';

export type OutputFormat = 'auto' | 'json' | 'pretty';
let format: OutputFormat = 'auto';
let command = '';

export function configureOutput(options: { json?: boolean; pretty?: boolean }): void {
  // Prefer machine output for the error if both incompatible flags are supplied.
  format = options.json ? 'json' : options.pretty ? 'pretty' : 'auto';
  if (options.json && options.pretty) throw new Error('Use either --json or --pretty, not both');
}

export function setOutputCommand(value: string): void {
  command = value;
}
export function getOutputFormat(): OutputFormat {
  return format;
}
export function usesPrettyOutput(): boolean {
  return format === 'pretty' || (format === 'auto' && Boolean(process.stdout.isTTY));
}

const replacer = (_key: string, value: unknown): unknown =>
  typeof value === 'bigint' ? value.toString() : value;

export function writeResult(result: Record<string, unknown>): void {
  process.stdout.write(
    usesPrettyOutput()
      ? prettyResult(result, { command, width: process.stdout.columns })
      : `${JSON.stringify(result, replacer)}\n`,
  );
}

export function writeEvent(event: Record<string, unknown>): void {
  process.stdout.write(
    usesPrettyOutput()
      ? `${prettyEvent(event, { width: process.stdout.columns })}\n`
      : `${JSON.stringify(event, replacer)}\n`,
  );
}
