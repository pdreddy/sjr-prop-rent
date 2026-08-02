import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const ADMIN_USERNAMES = ["admin1", "admin2", "admin3"] as const;

async function seedAdmins() {
  for (const username of ADMIN_USERNAMES) {
    const envKey = `${username.toUpperCase()}_PASSWORD`;
    const password = process.env[envKey];
    if (!password) {
      throw new Error(
        `Missing environment variable ${envKey}. Set it before running the seed script.`
      );
    }
    const passwordHash = await bcrypt.hash(password, 12);
    await prisma.admin.upsert({
      where: { username },
      create: { username, passwordHash, active: true },
      update: { passwordHash },
    });
    console.log(`Seeded admin: ${username}`);
  }
}

async function seedSampleUnits() {
  const samplePlots = [
    { plotNumber: "A-101", tenantName: "Ravi Kumar", phone: "9876543210", monthlyRent: 15000 },
    { plotNumber: "A-102", tenantName: "Priya Sharma", phone: "9876543211", monthlyRent: 15000 },
    { plotNumber: "A-103", tenantName: null, phone: null, monthlyRent: 14000 },
    { plotNumber: "B-201", tenantName: "Suresh Reddy", phone: "9876543212", monthlyRent: 18000 },
    { plotNumber: "B-202", tenantName: "Anita Rao", phone: "9876543213", monthlyRent: 18000 },
  ];

  for (const plot of samplePlots) {
    const unit = await prisma.unit.upsert({
      where: { plotNumber: plot.plotNumber },
      create: plot,
      update: {},
    });

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existingPayment = await prisma.payment.findUnique({
      where: { unitId_month: { unitId: unit.id, month } },
    });
    if (!existingPayment && plot.tenantName) {
      await prisma.payment.create({
        data: {
          unitId: unit.id,
          month,
          paymentStatus: "UNPAID",
          rentAmount: plot.monthlyRent,
          amountPaid: 0,
          balanceDue: plot.monthlyRent,
        },
      });
    }
  }
  console.log(`Seeded ${samplePlots.length} sample plots.`);
}

async function main() {
  await seedAdmins();
  await seedSampleUnits();
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
