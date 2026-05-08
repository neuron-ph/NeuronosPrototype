import { useMemo } from 'react';
import { useEnumOptions } from './useEnumOptions';
import { withLegacyOption } from '../utils/forms/legacyOption';

type DropdownOption = { value: string; label: string };

function uniqueNonEmpty(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const value of values) {
    const trimmed = (value ?? '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    ordered.push(trimmed);
  }
  return ordered;
}

function toOptions(values: readonly string[]): DropdownOption[] {
  return values.map(value => ({ value, label: value }));
}

export function useCustomerProfileOptions(params: {
  industryValuesFromRecords?: Array<string | null | undefined>;
  leadSourceValuesFromRecords?: Array<string | null | undefined>;
  currentIndustry?: string | null | undefined;
  currentLeadSource?: string | null | undefined;
} = {}) {
  const industrySeeds = useEnumOptions('industry');
  const leadSourceSeeds = useEnumOptions('lead_source');

  const industries = useMemo(() => (
    uniqueNonEmpty([
      ...industrySeeds,
      ...(params.industryValuesFromRecords ?? []),
      params.currentIndustry,
    ])
  ), [industrySeeds, params.industryValuesFromRecords, params.currentIndustry]);

  const leadSources = useMemo(() => (
    uniqueNonEmpty([
      ...leadSourceSeeds,
      ...(params.leadSourceValuesFromRecords ?? []),
      params.currentLeadSource,
    ])
  ), [leadSourceSeeds, params.leadSourceValuesFromRecords, params.currentLeadSource]);

  const industryOptions = useMemo(
    () => withLegacyOption(toOptions(industries), params.currentIndustry),
    [industries, params.currentIndustry],
  );

  const leadSourceOptions = useMemo(
    () => withLegacyOption(toOptions(leadSources), params.currentLeadSource),
    [leadSources, params.currentLeadSource],
  );

  return {
    industries,
    leadSources,
    industryOptions,
    leadSourceOptions,
  };
}
