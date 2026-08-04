// Who may act on whom (findings N1, N2).
//
// Both admin Edge Functions authenticate properly and then stop asking questions:
// once the caller holds the grant, nothing bounds WHO they may act on or WHAT
// authority they may hand out. That is how a Business Development manager minted
// a full executive with 1,611 grants and a password of his choosing, and how the
// coarse `edit` grant turned out to mean "take over any account in the org".
//
// This module is the missing half. It is deliberately shared by create-user and
// admin-user-actions so the two cannot drift apart — they already diverged once
// on how they resolve grants, and a security rule implemented twice is a security
// rule implemented once and forgotten once.

/** Seniority, as the DATA actually models it — not as the type suggests.
 *
 *  `users.role` carries only 'staff', 'team_leader' and 'manager' in practice;
 *  'supervisor' and 'executive' appear in validation lists and in nobody's row.
 *  Seniority above manager is expressed by DEPARTMENT: every member of
 *  'Executive' is role='manager'. Ranking on role alone would therefore treat the
 *  CEO as the peer of a pricing manager. */
export function rankOf(role?: string | null, department?: string | null): number {
  if ((department ?? "").toLowerCase() === "executive") return 4;
  switch ((role ?? "").toLowerCase()) {
    case "executive": return 4;
    case "manager": return 3;
    case "supervisor":
    case "team_leader": return 2;
    case "staff": return 1;
    default: return 0;
  }
}

export type Actor = { role?: string | null; department?: string | null };

/** May the caller act on / create someone at this rank and department?
 *
 *  Two rules, both of which the BD-manager escalation would have failed:
 *    1. You cannot reach ABOVE yourself. Equal rank is allowed — a manager
 *       resetting a peer in their own department is ordinary admin work.
 *    2. You cannot reach ACROSS departments unless you are Executive.
 *
 *  Returns null when permitted, or the reason to refuse with. */
export function refuseTargetReason(caller: Actor, target: Actor): string | null {
  const callerRank = rankOf(caller.role, caller.department);
  const targetRank = rankOf(target.role, target.department);

  if (callerRank === 0) {
    return "Your account has no recognised role, so it cannot administer users";
  }
  if (targetRank > callerRank) {
    return `You cannot act on an account more senior than your own (${target.role ?? "?"} in ${target.department ?? "?"})`;
  }
  const callerIsExec = rankOf(caller.role, caller.department) === 4;
  if (!callerIsExec) {
    const a = (caller.department ?? "").trim().toLowerCase();
    const b = (target.department ?? "").trim().toLowerCase();
    if (a !== b) {
      return `You can only administer accounts in your own department (${caller.department ?? "?"})`;
    }
  }
  return null;
}
