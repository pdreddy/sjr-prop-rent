import { listDocuments, newDocumentId, setDocument } from "../src/lib/firebase";
import { hashPassword } from "../src/lib/password";
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD before seeding");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must contain at least 10 characters");

  const admins = await listDocuments<{ username: string }>("admins");
  const id = admins.find((admin) => admin.username.toLowerCase() === username.toLowerCase())?.id ?? newDocumentId();
  await setDocument(`admins/${id}`, { username, passwordHash: await hashPassword(password), active: true });
  console.log(`Seeded admin ${username}`);

  console.log("Administrator setup complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
