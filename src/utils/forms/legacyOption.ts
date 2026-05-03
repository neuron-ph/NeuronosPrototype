/**
 * Append a synthetic "(legacy)" option for the current value when it is not
 * already represented in the options list. Used to render legacy enum values
 * (e.g. preferential_treatment from before the option set tightened) without
 * silently overwriting them on save.
 */
export function withLegacyOption<O extends { value: string; label: string }>(
  options: O[],
  current: string | null | undefined,
): O[] {
  const cur = (current ?? '').trim();
  if (!cur) return options;
  if (options.some(o => o.value === cur)) return options;
  return [...options, { value: cur, label: `${cur} (legacy)` } as O];
}

/**
 * Same as `withLegacyOption` but for the schema-driven booking renderer where
 * options are bare strings (FieldDef.options is string[]).
 */
export function withLegacyStringOption(
  options: readonly string[],
  current: string | null | undefined,
): string[] {
  const cur = (current ?? '').trim();
  if (!cur) return [...options];
  if (options.includes(cur)) return [...options];
  return [...options, cur];
}
