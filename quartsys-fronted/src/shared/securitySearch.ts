export type SearchableSecurity = {
  code: string;
  name?: string;
  full_code?: string;
};

function normalized(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function scoreMatch(item: SearchableSecurity, query: string) {
  const code = normalized(item.code);
  const fullCode = normalized(item.full_code);
  const name = normalized(item.name);

  if (code === query || fullCode === query) return 0;
  if (name === query) return 1;
  if (code.startsWith(query) || fullCode.startsWith(query)) return 2;
  if (name.startsWith(query)) return 3;
  if (code.includes(query) || fullCode.includes(query)) return 4;
  if (name.includes(query)) return 5;
  return 6;
}

/** Select the stable best match while preserving upstream ordering for ties. */
export function pickBestSecurityMatch<T extends SearchableSecurity>(
  results: T[] | null | undefined,
  query: string,
): T | null {
  const items = Array.isArray(results) ? results.filter((item) => item?.code) : [];
  const normalizedQuery = normalized(query);
  if (!items.length || !normalizedQuery) return null;

  return items.reduce((best, item) =>
    scoreMatch(item, normalizedQuery) < scoreMatch(best, normalizedQuery) ? item : best,
  );
}
