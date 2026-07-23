export function normalizeNegativePeerSeparatorArgv(argv: string[]): string[] {
  const out: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const cur = argv[i];

    // Indexed access is intentionally treated as optional: callers may pass a
    // sparse array even though process.argv itself never is one.
    if (cur === undefined) continue;

    if (cur === '--') {
      const next = argv[i + 1];

      // Support the documented `-- -100123 --limit 20` form for negative
      // Telegram peer ids by folding the peer back into normal argv parsing.
      if (next !== undefined && /^-\d+$/.test(next)) {
        out.push(next);
        i++;
        continue;
      }
    }

    out.push(cur);
  }

  return out;
}
