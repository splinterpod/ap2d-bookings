import "server-only";
import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { prisma } from "./db";

const SESSION_COOKIE = "ap2d_session";
const SESSION_TTL_DAYS = 14;

function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export async function createSession(userId: string): Promise<void> {
  const raw = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.authSession.create({
    data: { token: hashToken(raw), userId, expiresAt },
  });

  const jar = await cookies();
  jar.set(SESSION_COOKIE, raw, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (raw) {
    await prisma.authSession.deleteMany({ where: { token: hashToken(raw) } });
  }
  jar.delete(SESSION_COOKIE);
}

/** Returns the userId for the current valid session, or null. */
export async function getSessionUserId(): Promise<string | null> {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  const session = await prisma.authSession.findUnique({
    where: { token: hashToken(raw) },
  });
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await prisma.authSession.delete({ where: { id: session.id } }).catch(() => {});
    return null;
  }
  return session.userId;
}
