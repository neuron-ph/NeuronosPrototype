// NEU-068: derive the net payment days from an invoice's credit terms so the
// due date honors the term (e.g. "NET 15" → invoice date + 15) instead of a
// hardcoded +30. "COD"/"DUE"/"CASH"/"RECEIPT" → same-day (0). Blank or
// unparseable → 15 (matches the default "NET 15" term).
export function parseCreditTermDays(terms: string): number {
  const match = terms?.match(/\d+/);
  if (match) return parseInt(match[0], 10);
  if (/COD|CASH|DUE|RECEIPT/i.test(terms || "")) return 0;
  return 15;
}
