import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

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

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) {
    console.error(`No admin found with username "${username}".`);
    await prisma.$disconnect();
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma.admin.update({
    where: { username },
    data: { passwordHash, failedLoginAttempts: 0, lockedUntil: null },
  });

  console.log(`Password updated for admin "${username}".`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
