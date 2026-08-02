import { listDocuments, setDocument } from "../src/lib/firebase";
import { hashPassword } from "../src/lib/password";

const [username, password] = process.argv.slice(2);
if (!username || !password) throw new Error("Usage: npm run admin:set-password -- <username> <password>");
if (password.length < 10) throw new Error("Password must be at least 10 characters.");
const admin = (await listDocuments<{ username: string }>("admins")).find((item) => item.username.toLowerCase() === username.toLowerCase());
if (!admin) throw new Error(`No admin found with username "${username}".`);
await setDocument(`admins/${admin.id}`, { passwordHash: await hashPassword(password) }, true);
console.log(`Password updated for ${username}.`);
