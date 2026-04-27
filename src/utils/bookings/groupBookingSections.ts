import type { SectionDef } from '../../config/booking/bookingFieldTypes';

export type GroupedBookingSections = {
  generalSections: SectionDef[];
  specificSections: SectionDef[];
};

/**
 * Splits already-visible booking schema sections into the two UI buckets used
 * by the shared booking form surfaces.
 */
export function groupBookingSections(sections: SectionDef[]): GroupedBookingSections {
  const generalSections = sections.filter(section => section.displayGroup === 'general');
  const specificSections = sections.filter(section => section.displayGroup !== 'general');

  return {
    generalSections,
    specificSections,
  };
}
