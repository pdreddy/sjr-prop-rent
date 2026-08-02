import { listDocuments, newDocumentId, setDocument } from "../src/lib/firebase";
import { hashPassword } from "../src/lib/password";
import { createUnit, paymentStatus, savePayment, unitByPlot } from "../src/lib/store";

const samples = [
  ["A-101", "Ravi Kumar", 15000], ["A-102", "Priya Sharma", 15000], ["A-103", null, 14000], ["B-201", "Suresh Reddy", 18000], ["B-202", "Anita Rao", 18000],
] as const;
async function main() {
  const username = process.env.ADMIN_USERNAME;
  const password = process.env.ADMIN_PASSWORD;
  if (!username || !password) throw new Error("Set ADMIN_USERNAME and ADMIN_PASSWORD before seeding");
  if (password.length < 10) throw new Error("ADMIN_PASSWORD must contain at least 10 characters");

  const admins = await listDocuments<{ username: string }>("admins");
  const id = admins.find((admin) => admin.username.toLowerCase() === username.toLowerCase())?.id ?? newDocumentId();
  await setDocument(`admins/${id}`, { username, passwordHash: await hashPassword(password), active: true });
  console.log(`Seeded admin ${username}`);

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  for (const [plotNumber, tenantName, monthlyRent] of samples) {
    const unit = await unitByPlot(plotNumber) ?? await createUnit({ plotNumber, tenantName, moveInDate: null, phone: null, monthlyRent, maintenanceAmount: 0, active: true });
    if (tenantName) await savePayment(unit.id, month, { paymentStatus: paymentStatus(0, monthlyRent), rentAmount: monthlyRent, maintenanceAmount: 0, amountPaid: 0, balanceDue: monthlyRent, paidDate: null, notes: null, updatedBy: null });
  }
  console.log("Firebase seed complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
