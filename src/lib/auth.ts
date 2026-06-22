import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { prisma } from "./db";
import { getSessionUserId } from "./session";

export type SafeUser = Omit<User, "passwordHash">;

function strip(user: User): SafeUser {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}

/** Current logged-in user (any status), or null if no valid session. */
export async function getCurrentUser(): Promise<SafeUser | null> {
  const userId = await getSessionUserId();
  if (!userId) return null;
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  // Defensive: an expired guest behaves as deactivated even before the cron runs.
  if (
    user.role === "GUEST" &&
    user.guestExpiresAt &&
    user.guestExpiresAt.getTime() < Date.now() &&
    user.status === "ACTIVE"
  ) {
    return strip({ ...user, status: "DEACTIVATED" });
  }
  return strip(user);
}

/** Require any logged-in account; routes pending/deactivated to the right page. */
export async function requireUser(): Promise<SafeUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "PENDING") redirect("/pending");
  if (user.status === "DEACTIVATED") redirect("/deactivated");
  return user;
}

export async function requireAdmin(): Promise<SafeUser> {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/");
  return user;
}

export function isActive(user: SafeUser | null): boolean {
  return !!user && user.status === "ACTIVE";
}
