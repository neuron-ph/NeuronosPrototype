/**
 * Normalize a free-form role label into a stable machine key.
 *
 *   "Customs Declarant"   -> "customs_declarant"
 *   "Operations Supervisor" -> "operations_supervisor"
 *   "Team Leader (PH)"    -> "team_leader_ph"
 *
 * Constraints (mirror the DB CHECK):
 *   - lowercase
 *   - first char must be a-z
 *   - remaining chars must be a-z, 0-9, or _
 */
export function normalizeRoleKey(label: string): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/__+/g, '_');

  // Ensure the first character is a-z. If the label starts with a digit or is
  // empty after slugging, prefix with "role_".
  if (!slug) return 'role';
  if (!/^[a-z]/.test(slug)) return `role_${slug}`;
  return slug;
}
