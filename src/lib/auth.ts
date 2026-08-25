import "server-only";
import { getDocument, listDocuments, newDocumentId, setDocument } from "./firebase";
import { clearSessionCookie, getSession, setSessionCookie } from "./session";
import { hashPassword, passwordsMatch, verifyPassword } from "./password";
import type { AdminRole } from "./types";
export { verifyPassword } from "./password";

export interface AdminRecord { id: string; username: string; passwordHash: string; active: boolean; role?: AdminRole }
export interface AuthedAdmin { id: string; username: string; role: AdminRole }
export type LoginResult = { ok: true } | { ok: false; error: string };

// Bootstrap credentials — set as env vars — auto-create their admin record with the
// given role the first time someone signs in with them, same pattern for both roles.
const BOOTSTRAP_ACCOUNTS: { username?: string; password?: string; role: AdminRole }[] = [
  { username: process.env.ADMIN_USERNAME, password: process.env.ADMIN_PASSWORD, role: "ADMIN" },
  { username: process.env.SECURITY_USERNAME, password: process.env.SECURITY_PASSWORD, role: "SECURITY" },
];

export async function findAdmin(username: string) {
  const normalized = username.trim().toLowerCase();
  return (await listDocuments<Omit<AdminRecord, "id">>("admins")).find((admin) => admin.username.toLowerCase() === normalized) ?? null;
}

export async function saveAdminPassword(id: string, password: string) {
  await setDocument(`admins/${id}`, { passwordHash: await hashPassword(password) }, true);
}

export async function login(username: string, password: string): Promise<LoginResult> {
  let admin = await findAdmin(username);
  const bootstrap = BOOTSTRAP_ACCOUNTS.find(
    (b) =>
      b.username &&
      b.password &&
      b.username.trim().toLowerCase() === username.trim().toLowerCase() &&
      passwordsMatch(b.password, password)
  );

  if (bootstrap && !admin) {
    const id = newDocumentId();
    const passwordHash = await hashPassword(password);
    await setDocument(`admins/${id}`, {
      username: bootstrap.username!,
      passwordHash,
      active: true,
      role: bootstrap.role,
    });
    admin = { id, username: bootstrap.username!, passwordHash, active: true, role: bootstrap.role };
  }

  if (!admin?.active || !(await verifyPassword(password, admin.passwordHash))) return { ok: false, error: "Invalid username or password." };
  await setSessionCookie(admin.id, admin.username);
  return { ok: true };
}

export async function logout() { await clearSessionCookie(); }
export async function getAuthedAdmin(): Promise<AuthedAdmin | null> {
  const session = await getSession();
  if (!session) return null;
  const admin = await getDocument<Omit<AdminRecord, "id">>(`admins/${session.adminId}`);
  return admin?.active && admin.username === session.username
    ? { id: admin.id, username: admin.username, role: admin.role ?? "ADMIN" }
    : null;
}
