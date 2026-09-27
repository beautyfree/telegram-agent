import { styleText } from 'node:util';
import {
  S_BAR,
  S_BAR_END,
  S_BAR_H,
  S_BAR_START,
  S_CORNER_BOTTOM_LEFT,
  S_CORNER_BOTTOM_RIGHT,
  S_CORNER_TOP_LEFT,
  S_CORNER_TOP_RIGHT,
  S_RADIO_ACTIVE,
  unicodeOr,
} from '@clack/prompts';

// Use the same glyphs and palette as Clack's login flow, without starting a prompt.
export const glyphs = {
  start: S_BAR_START,
  bar: S_BAR,
  end: S_BAR_END,
  horizontal: S_BAR_H,
  topLeft: S_CORNER_TOP_LEFT,
  topRight: S_CORNER_TOP_RIGHT,
  bottomLeft: S_CORNER_BOTTOM_LEFT,
  bottomRight: S_CORNER_BOTTOM_RIGHT,
  selected: S_RADIO_ACTIVE,
  topJoin: unicodeOr('┬', '+'),
  bottomJoin: unicodeOr('┴', '+'),
  leftJoin: unicodeOr('├', '+'),
  rightJoin: unicodeOr('┤', '+'),
  middleJoin: unicodeOr('┼', '+'),
};

export function supportsOutputColor(
  isTTY = Boolean(process.stdout.isTTY),
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    isTTY &&
    env.NO_COLOR === undefined &&
    env.NODE_DISABLE_COLORS !== '1' &&
    env.FORCE_COLOR !== '0' &&
    env.TERM !== 'dumb'
  );
}

export function createTheme(color = false) {
  const paint = (format: Parameters<typeof styleText>[0], text: string): string =>
    color ? styleText(format, text, { validateStream: false }) : text;
  return {
    muted: (text: string) => paint('dim', text),
    accent: (text: string) => paint('cyan', text),
    heading: (text: string) => paint(['bold', 'cyan'], text),
    success: (text: string) => paint('green', text),
    error: (text: string) => paint(['bold', 'red'], text),
  };
}
export type TerminalTheme = ReturnType<typeof createTheme>;
