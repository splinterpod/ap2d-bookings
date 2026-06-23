import "server-only";
import { getCurrentUser } from "./auth";
import { getImpersonatorRawToken } from "./session";

export async function getImpersonationView(): Promise<{ username: string } | null> {
  if (!(await getImpersonatorRawToken())) return null;
  const user = await getCurrentUser();
  if (!user) return null;
  return { username: user.username };
}
