import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const JUNE_2026 = "2026-06";

interface TenantRecord {
  plotNumber: string;
  tenantName: string;
  moveInDate: Date;
  rent: number;
  maintenance: number;
  rentSum: number;
  amountPaid: number | "unknown";
  phone: string | null;
  notes: string | null;
}

// Source: building rent register (plots 101-503). "Rent June (Pay July)" values
// marked "?" / "??" in the original sheet are unclear amounts and are imported
// as UNPAID with a note flagging them for manual verification.
const tenants: TenantRecord[] = [
  {
    plotNumber: "102",
    tenantName: "Lavanya",
    moveInDate: new Date("2026-06-15"),
    rent: 20000,
    maintenance: 0,
    rentSum: 20000,
    amountPaid: 20000,
    phone: "8197257978",
    notes: "Power balance pending",
  },
  {
    plotNumber: "103",
    tenantName: "Shaini D Souza",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 1000,
    rentSum: 21000,
    amountPaid: 21100,
    phone: "7259776382",
    notes: null,
  },
  {
    plotNumber: "201",
    tenantName: "Govinda Raju",
    moveInDate: new Date("2026-06-18"),
    rent: 30000,
    maintenance: 1000,
    rentSum: 31000,
    amountPaid: "unknown",
    phone: "9538498616",
    notes: null,
  },
  {
    plotNumber: "202",
    tenantName: "Vijaya Kumari",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 0,
    rentSum: 20000,
    amountPaid: 20500,
    phone: "9490426357",
    notes: null,
  },
  {
    plotNumber: "203",
    tenantName: "Vivek Jain",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 2000,
    rentSum: 22000,
    amountPaid: 22500,
    phone: "9163574744",
    notes: null,
  },
  {
    plotNumber: "301",
    tenantName: "Charvi",
    moveInDate: new Date("2026-06-15"),
    rent: 30000,
    maintenance: 0,
    rentSum: 30000,
    amountPaid: 15500,
    phone: "7298781751",
    notes: null,
  },
  {
    plotNumber: "302",
    tenantName: "Sarathi Sriramwar",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 1000,
    rentSum: 21000,
    amountPaid: 21500,
    phone: "8897965209",
    notes: null,
  },
  {
    plotNumber: "303",
    tenantName: "Aman Sharma",
    moveInDate: new Date("2026-05-01"),
    rent: 20000,
    maintenance: 2000,
    rentSum: 22000,
    amountPaid: 22000,
    phone: "9915759859",
    notes: null,
  },
  {
    plotNumber: "401",
    tenantName: "Lalitha/Chiatnya",
    moveInDate: new Date("2026-05-15"),
    rent: 30000,
    maintenance: 2000,
    rentSum: 32000,
    amountPaid: 33200,
    phone: "9110575689",
    notes: null,
  },
  {
    plotNumber: "402",
    tenantName: "Devashish",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 1000,
    rentSum: 21000,
    amountPaid: "unknown",
    phone: "8630712680",
    notes: null,
  },
  {
    plotNumber: "403",
    tenantName: "Repanna Chowdappa",
    moveInDate: new Date("2026-06-21"),
    rent: 20000,
    maintenance: 2000,
    rentSum: 22000,
    amountPaid: "unknown",
    phone: "7829644434",
    notes: null,
  },
  {
    plotNumber: "502",
    tenantName: "Malavika Kanampara",
    moveInDate: new Date("2026-06-01"),
    rent: 20000,
    maintenance: 0,
    rentSum: 20000,
    amountPaid: 20000,
    phone: "7259261157",
    notes: "Power balance pending",
  },
  {
    plotNumber: "503",
    tenantName: "Rahul",
    moveInDate: new Date("2026-06-15"),
    rent: 20000,
    maintenance: 0,
    rentSum: 20000,
    amountPaid: 10500,
    phone: "6282201927",
    notes: null,
  },
];

// 101 and 501 joined in August 2026 — no June payment record; only their
// total rent sum (rent + maintenance breakdown not yet finalized) is known.
const newJoiners = [
  { plotNumber: "101", tenantName: "Deepika Kumari", moveInDate: new Date("2026-08-01"), rentSum: 28000, phone: null as string | null },
  { plotNumber: "501", tenantName: "Prasunk Jain", moveInDate: new Date("2026-08-01"), rentSum: 30000, phone: null as string | null },
];

async function main() {
  for (const t of tenants) {
    const unit = await prisma.unit.upsert({
      where: { plotNumber: t.plotNumber },
      create: {
        plotNumber: t.plotNumber,
        tenantName: t.tenantName,
        moveInDate: t.moveInDate,
        phone: t.phone,
        monthlyRent: t.rent,
        maintenanceAmount: t.maintenance,
      },
      update: {
        tenantName: t.tenantName,
        moveInDate: t.moveInDate,
        phone: t.phone,
        monthlyRent: t.rent,
        maintenanceAmount: t.maintenance,
        active: true,
      },
    });

    const amountPaid = t.amountPaid === "unknown" ? 0 : t.amountPaid;
    const balanceDue = t.rentSum - amountPaid;
    const paymentStatus =
      t.amountPaid === "unknown"
        ? "UNPAID"
        : amountPaid <= 0
          ? "UNPAID"
          : amountPaid >= t.rentSum
            ? "PAID"
            : "PARTIAL";
    const notes =
      t.amountPaid === "unknown"
        ? [t.notes, "Amount paid for June unclear in source records — needs verification"]
            .filter(Boolean)
            .join(". ")
        : t.notes;

    await prisma.payment.upsert({
      where: { unitId_month: { unitId: unit.id, month: JUNE_2026 } },
      create: {
        unitId: unit.id,
        month: JUNE_2026,
        paymentStatus,
        rentAmount: t.rent,
        maintenanceAmount: t.maintenance,
        amountPaid,
        balanceDue,
        notes,
      },
      update: {
        paymentStatus,
        rentAmount: t.rent,
        maintenanceAmount: t.maintenance,
        amountPaid,
        balanceDue,
        notes,
      },
    });

    console.log(`Imported plot ${t.plotNumber} (${t.tenantName})`);
  }

  for (const j of newJoiners) {
    await prisma.unit.upsert({
      where: { plotNumber: j.plotNumber },
      create: {
        plotNumber: j.plotNumber,
        tenantName: j.tenantName,
        moveInDate: j.moveInDate,
        phone: j.phone,
        monthlyRent: j.rentSum,
        maintenanceAmount: 0,
      },
      update: {
        tenantName: j.tenantName,
        moveInDate: j.moveInDate,
        phone: j.phone,
        monthlyRent: j.rentSum,
        active: true,
      },
    });
    console.log(`Imported plot ${j.plotNumber} (${j.tenantName}, no June payment — joined August)`);
  }

  console.log(`Done. Imported ${tenants.length + newJoiners.length} plots.`);
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
