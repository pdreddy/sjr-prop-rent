import "server-only";
import bcrypt from "bcryptjs";
import { getAdminByUsername, updateAdmin } from "./db";
import { getSession, setSessionCookie, clearSessionCookie } from "./session";
import { MAX_FAILED_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MINUTES } from "./constants";

export interface AuthedAdmin {
  id: string;
  username: string;
}

export type LoginResult =
  | { ok: true }
  | { ok: false; error: string };

export async function login(
  username: string,
  password: string
): Promise<LoginResult> {
  const admin = await getAdminByUsername(username);

  // Always run a bcrypt compare, even for unknown usernames, so response
  // timing doesn't reveal whether the username exists.
  const passwordHash = admin?.passwordHash ?? "$2b$10$invalidsaltinvalidsaltinvalidsalu";
  const passwordMatches = await bcrypt.compare(password, passwordHash);

  if (!admin || !admin.active) {
    return { ok: false, error: "Invalid username or password." };
  }

  if (admin.lockedUntil && admin.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((admin.lockedUntil - Date.now()) / 60000);
    return {
      ok: false,
      error: `Account temporarily locked. Try again in ${minutesLeft} minute(s).`,
    };
  }

  if (!passwordMatches) {
    const failedAttempts = admin.failedLoginAttempts + 1;
    const shouldLock = failedAttempts >= MAX_FAILED_LOGIN_ATTEMPTS;
    await updateAdmin(admin.username, {
      failedLoginAttempts: shouldLock ? 0 : failedAttempts,
      lockedUntil: shouldLock ? Date.now() + LOCKOUT_DURATION_MINUTES * 60 * 1000 : null,
    });
    return { ok: false, error: "Invalid username or password." };
  }

  await updateAdmin(admin.username, { failedLoginAttempts: 0, lockedUntil: null });

  await setSessionCookie({ adminId: admin.id, username: admin.username });
  return { ok: true };
}

export async function logout(): Promise<void> {
  await clearSessionCookie();
}

/**
 * Resolves the current authenticated admin from the session cookie,
 * re-checking the database so deactivated admins lose access immediately.
 * Returns null if there is no valid, active admin session.
 */
export async function getAuthedAdmin(): Promise<AuthedAdmin | null> {
  const session = await getSession();
  if (!session) return null;

  const admin = await getAdminByUsername(session.adminId);

  if (!admin || !admin.active || admin.username !== session.username) {
    return null;
  }

  return { id: admin.id, username: admin.username };
}
