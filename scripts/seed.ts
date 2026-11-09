import { listDocuments, newDocumentId, setDocument } from "../src/lib/firebase";
import { hashPassword } from "../src/lib/password";

async function seedAccount(username: string, password: string, role: "ADMIN" | "SECURITY") {
  if (password.length < 10) throw new Error(`Password for ${username} must contain at least 10 characters`);
  const admins = await listDocuments<{ username: string }>("admins");
  const id = admins.find((admin) => admin.username.toLowerCase() === username.toLowerCase())?.id ?? newDocumentId();
  await setDocument(`admins/${id}`, { username, passwordHash: await hashPassword(password), active: true, role });
  console.log(`Seeded ${role.toLowerCase()} ${username}`);
}

async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD before seeding");
  await seedAccount(username, password, "ADMIN");

  const securityUsername = process.env.SECURITY_USERNAME;
  const securityPassword = process.env.SECURITY_PASSWORD;
  if (securityUsername && securityPassword) {
    await seedAccount(securityUsername, securityPassword, "SECURITY");
  }

  console.log("Administrator setup complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
