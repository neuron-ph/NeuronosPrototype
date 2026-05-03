import freightForwardingSql from "../supabase/migrations/045_seed_chart_of_accounts_freight_forwarding.sql?raw";
import expenseCategoriesSql from "../supabase/migrations/055_seed_expense_categories_coa.sql?raw";

export interface SeedAccountRow {
  id: string;
  code: string;
  name: string;
  type: string;
  sub_type: string | null;
  category: string | null;
  normal_balance: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
  balance: number;
  starting_amount: number;
  parent_id: string | null;
  currency: string;
}

function parseColumns(sql: string): string[] {
  const match = sql.match(/INSERT INTO accounts\s*\(([\s\S]*?)\)\s*VALUES/i);
  if (!match) {
    throw new Error("Unable to parse account seed columns");
  }

  return match[1]
    .split(",")
    .map((column) => column.trim())
    .filter(Boolean);
}

function parseTuple(tupleLine: string): unknown[] {
  const tupleBody = tupleLine
    .trim()
    .replace(/\)\s*,?\s*$/, "")
    .replace(/^\(/, "");

  const values: string[] = [];
  let current = "";
  let inString = false;

  for (let index = 0; index < tupleBody.length; index += 1) {
    const char = tupleBody[index];
    const nextChar = tupleBody[index + 1];

    if (char === "'") {
      if (inString && nextChar === "'") {
        current += "'";
        index += 1;
        continue;
      }

      inString = !inString;
      continue;
    }

    if (char === "," && !inString) {
      values.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current.trim());

  return values.map((value) => {
    if (value === "NULL") return null;
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "") return "";

    const numeric = Number(value);
    if (!Number.isNaN(numeric)) return numeric;

    return value;
  });
}

function parseAccountsFromSql(sql: string): SeedAccountRow[] {
  const columns = parseColumns(sql);
  const rows = sql
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("("));

  return rows.map((row) => {
    const values = parseTuple(row);
    const entry = Object.fromEntries(columns.map((column, index) => [column, values[index]])) as Record<string, unknown>;

    return {
      id: String(entry.id),
      code: String(entry.code),
      name: String(entry.name),
      type: String(entry.type),
      sub_type: entry.sub_type == null ? null : String(entry.sub_type),
      category: entry.category == null ? null : String(entry.category),
      normal_balance: String(entry.normal_balance ?? "debit"),
      is_active: Boolean(entry.is_active),
      is_system: Boolean(entry.is_system),
      sort_order: Number(entry.sort_order ?? 0),
      balance: Number(entry.balance ?? 0),
      starting_amount: Number(entry.starting_amount ?? 0),
      parent_id: entry.parent_id == null ? null : String(entry.parent_id),
      currency: entry.currency == null ? "PHP" : String(entry.currency),
    };
  });
}

// DEV DATABASE only seed.
// This is intentionally sourced from the SQL migrations so the app reset flow
// restores the same freight-forwarding Chart of Accounts used by the dev DB.
export const freightForwardingCoASeed: SeedAccountRow[] = [
  ...parseAccountsFromSql(freightForwardingSql),
  ...parseAccountsFromSql(expenseCategoriesSql),
].sort((left, right) => {
  const sortDiff = left.sort_order - right.sort_order;
  if (sortDiff !== 0) return sortDiff;
  return left.code.localeCompare(right.code);
});

