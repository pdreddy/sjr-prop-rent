import { spawn } from "node:child_process";

// One command to try the whole app locally, with no Firebase and no .env:  npm run local
// Starts an in-memory demo database (scripts/mock-firebase.ts), fills it with sample plots, then runs
// the app. Sign in at /admin/login with  admin / admin123.  Data resets every time you restart.
// To use your real data instead, run `npm run dev` with your .env.
const DB_PORT = process.env.MOCK_FIREBASE_PORT ?? "9000";
const APP_PORT = process.env.PORT ?? "3000";
process.env.MOCK_FIREBASE_PORT = DB_PORT;
process.env.FIREBASE_DATABASE_EMULATOR_HOST = `127.0.0.1:${DB_PORT}`;
process.env.SESSION_SECRET ??= "local-demo-session-secret-not-for-production-use";
process.env.ADMIN_USERNAME = "admin";
process.env.ADMIN_PASSWORD = "admin123";

async function waitForDb() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(`http://127.0.0.1:${DB_PORT}/ping.json`); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error(`The demo database did not start on port ${DB_PORT} (is it already in use?)`);
}

async function main() {
  await import("./mock-firebase"); // starts the in-memory database
  await waitForDb();
  const { createUnit, savePayment, setGeneralSettings } = await import("../src/lib/store");
  const { getCurrentMonth, getPreviousMonth } = await import("../src/lib/month");

  const M = getCurrentMonth(), M1 = getPreviousMonth(M), M2 = getPreviousMonth(M1), M3 = getPreviousMonth(M2), M4 = getPreviousMonth(M3);
  const first = (m: string, day = 1) => new Date(`${m}-${String(day).padStart(2, "0")}T00:00:00.000Z`);
  const base = { phoneNumbers: ["9000000000"], advanceAmount: 0, advancePaid: 0, advancePaidDate: null, advanceNotes: null, active: true };
  type Row = [month: string, paid: number, prev: number, curr: number];
  async function plot(plotNumber: string, tenantName: string | null, moveIn: Date | null, rent: number, maint: number, rows: Row[]) {
    const unit = await createUnit({ ...base, plotNumber, tenantName, moveInDate: moveIn, monthlyRent: rent, maintenanceAmount: maint });
    for (const [month, paid, prev, curr] of rows) {
      const due = rent + maint;
      await savePayment(unit.id, month, {
        paymentStatus: paid >= due ? "PAID" : paid > 0 ? "PARTIAL" : "UNPAID", rentAmount: rent, maintenanceAmount: maint, amountPaid: paid, balanceDue: Math.max(0, due - paid),
        paidDate: paid > 0 ? new Date(`${month}-05T00:00:00.000Z`) : null, notes: null, prevReading: prev, currReading: curr, electricityAmount: 0, electricityPaid: false, updatedBy: "demo",
      });
    }
  }
  await plot("101", "Ravi Kumar", first(M4), 20000, 1000, [[M3, 21000, 100, 148], [M2, 21000, 148, 201], [M1, 21000, 201, 262], [M, 0, 0, 0]]);
  await plot("102", "Anita Rao", first(M4, 10), 15000, 500, [[M3, 15500, 50, 90], [M2, 15500, 90, 131], [M1, 8000, 131, 170], [M, 0, 0, 0]]);
  await plot("103", "Suresh Babu", first(M1, 15), 16500, 1000, [[M, 0, 0, 0]]);
  await plot("104", "Priya Nair", first(M, 3), 18000, 1000, []);
  await plot("105", null, null, 0, 0, []);
  await plot("201", "Meera Joshi", first(M4), 22000, 1000, [[M3, 23500, 300, 352], [M2, 23000, 352, 400], [M1, 23000, 400, 455], [M, 23000, 0, 0]]);
  await plot("202", "Karthik Reddy", first(M4), 19000, 1000, [[M3, 20000, 0, 0], [M2, 0, 0, 0], [M1, 0, 0, 0], [M, 0, 0, 0]]);
  await setGeneralSettings({ buildingName: "SJR Building (demo)", showTenantNames: true, notice: "Demo data: nothing here is real. Rent is due by the 5th." }, "demo");
  console.log("Demo data loaded: 7 plots (paid, partial, unpaid, new move-in, vacant).");

  const app = spawn("npx", ["next", "dev", "-p", APP_PORT], { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
  const stop = () => { app.kill(); process.exit(0); };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  app.on("exit", (code) => process.exit(code ?? 0));
  console.log(`\n  Public page:  http://localhost:${APP_PORT}\n  Admin login:  http://localhost:${APP_PORT}/admin/login   (admin / admin123)\n`);
}

main().catch((error) => { console.error(error); process.exit(1); });
