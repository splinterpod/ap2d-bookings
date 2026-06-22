import "server-only";
import { ACCOUNT_OWNER_EMAIL } from "./env";

export function isAccountOwner(user: { email: string }): boolean {
  return user.email.trim().toLowerCase() === ACCOUNT_OWNER_EMAIL;
}

/** Only the account owner may assign or promote users to ADMIN. */
export function canAssignAdminRole(admin: { email: string }): boolean {
  return isAccountOwner(admin);
}

/** Whether this admin may change the target user's role (owner: anyone except self). */
export function canAdminEditUserRole(
  admin: { id: string; email: string },
  target: { id: string; role: string },
): boolean {
  if (admin.id === target.id) return false;
  if (isAccountOwner(admin)) return true;
  return target.role !== "ADMIN";
}
