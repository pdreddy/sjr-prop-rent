import "server-only";
import { getDocument, listDocuments, newDocumentId, setDocument } from "./firebase";
import { clearSessionCookie, getSession, setSessionCookie } from "./session";
import { hashPassword, passwordsMatch, verifyPassword } from "./password";
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
  let admin = await findAdmin(username);
  const configuredUsername = process.env.ADMIN_USERNAME;
  const configuredPassword = process.env.ADMIN_PASSWORD;
  const matchesBootstrapLogin = Boolean(
    configuredUsername && configuredPassword &&
    configuredUsername.trim().toLowerCase() === username.trim().toLowerCase() &&
    passwordsMatch(configuredPassword, password)
  );

  if (matchesBootstrapLogin && !admin) {
    const id = newDocumentId();
    const passwordHash = await hashPassword(password);
    await setDocument(`admins/${id}`, {
      username: configuredUsername!,
      passwordHash,
      active: true,
    });
    admin = { id, username: configuredUsername!, passwordHash, active: true };
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
  return admin?.active && admin.username === session.username ? { id: admin.id, username: admin.username } : null;
}
