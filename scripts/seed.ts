import "dotenv/config";
import bcrypt from "bcryptjs";
import { upsertAdminPassword, getUnitByPlotNumber, createUnit, getPayment, upsertPayment } from "../src/lib/db";

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
    await upsertAdminPassword(username, passwordHash);
    console.log(`Seeded admin: ${username}`);
  }
}

async function seedSampleUnits() {
  const samplePlots = [
    {
      plotNumber: "A-101",
      tenantName: "Ravi Kumar",
      moveInDate: new Date("2024-01-15").getTime(),
      phone: "9876543210",
      monthlyRent: 15000,
    },
    {
      plotNumber: "A-102",
      tenantName: "Priya Sharma",
      moveInDate: new Date("2023-06-01").getTime(),
      phone: "9876543211",
      monthlyRent: 15000,
    },
    {
      plotNumber: "A-103",
      tenantName: null,
      moveInDate: null,
      phone: null,
      monthlyRent: 14000,
    },
    {
      plotNumber: "B-201",
      tenantName: "Suresh Reddy",
      moveInDate: new Date("2022-11-10").getTime(),
      phone: "9876543212",
      monthlyRent: 18000,
    },
    {
      plotNumber: "B-202",
      tenantName: "Anita Rao",
      moveInDate: new Date("2025-02-20").getTime(),
      phone: "9876543213",
      monthlyRent: 18000,
    },
  ];

  for (const plot of samplePlots) {
    let unit = await getUnitByPlotNumber(plot.plotNumber);
    if (!unit) {
      unit = await createUnit({
        plotNumber: plot.plotNumber,
        tenantName: plot.tenantName,
        moveInDate: plot.moveInDate,
        phone: plot.phone,
        monthlyRent: plot.monthlyRent,
        maintenanceAmount: 0,
        active: true,
      });
    }

    const now = new Date();
    const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const existingPayment = await getPayment(unit.id, month);
    if (!existingPayment && plot.tenantName) {
      await upsertPayment(unit.id, month, {
        paymentStatus: "UNPAID",
        rentAmount: plot.monthlyRent,
        maintenanceAmount: 0,
        amountPaid: 0,
        balanceDue: plot.monthlyRent,
        paidDate: null,
        notes: null,
        updatedBy: null,
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
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
