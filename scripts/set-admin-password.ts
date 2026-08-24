import "dotenv/config";
import bcrypt from "bcryptjs";
import { getAdminByUsername, upsertAdminPassword } from "../src/lib/db";

async function main() {
  const [username, newPassword] = process.argv.slice(2);
  if (!username || !newPassword) {
    console.error("Usage: npm run admin:set-password -- <username> <newPassword>");
    process.exit(1);
  }
  if (newPassword.length < 10) {
    console.error("Password must be at least 10 characters.");
    process.exit(1);
  }

  const admin = await getAdminByUsername(username);
  if (!admin) {
    console.error(`No admin found with username "${username}".`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await upsertAdminPassword(username, passwordHash);

  console.log(`Password updated for admin "${username}".`);
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
