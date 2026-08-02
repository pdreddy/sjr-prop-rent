import "server-only";
import { getDocument, listDocuments, setDocument } from "./firebase";
import { clearSessionCookie, getSession, setSessionCookie } from "./session";
import { hashPassword, verifyPassword } from "./password";
export { verifyPassword } from "./password";

export interface AdminRecord { id: string; username: string; passwordHash: string; active: boolean }
export interface AuthedAdmin { id: string; username: string }
export type LoginResult = { ok: true } | { ok: false; error: string };

export async function findAdmin(username: string) {
  const normalized = username.trim().toLowerCase();
  return (await listDocuments<Omit<AdminRecord, "id">>("admins")).find((admin) => admin.username.toLowerCase() === normalized) ?? null;
}

export async function saveAdminPassword(id: string, password: string) {
  await setDocument(`admins/${id}`, { passwordHash: await hashPassword(password) }, true);
}

export async function login(username: string, password: string): Promise<LoginResult> {
  const admin = await findAdmin(username);
  if (!admin?.active || !(await verifyPassword(password, admin.passwordHash))) return { ok: false, error: "Invalid username or password." };
  await setSessionCookie(admin.id, admin.username);
  return { ok: true };
}

export async function logout() { await clearSessionCookie(); }
export async function getAuthedAdmin(): Promise<AuthedAdmin | null> {
  const session = await getSession();
  if (!session) return null;
  const admin = await getDocument<Omit<AdminRecord, "id">>(`admins/${session.adminId}`);
  return admin?.active && admin.username === session.username ? { id: admin.id, username: admin.username } : null;
}
