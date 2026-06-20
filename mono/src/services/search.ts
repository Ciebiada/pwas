const normalizeSearchText = (value: string) => value.trim().toLowerCase();

export const searchMatches = (value: string, query: string) => {
  const tokens = normalizeSearchText(query).split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  const normalizedValue = normalizeSearchText(value);
  const valueTokens = normalizedValue.split(/[^a-z0-9#]+/).filter(Boolean);

  return tokens.every(
    (token) => normalizedValue.includes(token) || valueTokens.some((value) => value.startsWith(token)),
  );
};
