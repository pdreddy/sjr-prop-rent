/* eslint-disable @typescript-eslint/no-explicit-any -- a test script reading loosely typed JSON responses */
import { createUnit, savePayment } from "../src/lib/store";
import { getCurrentMonth, getPreviousMonth } from "../src/lib/month";

// End-to-end data check against the local mock database (see scripts/mock-firebase.ts):
//   npm run db:mock                       (terminal 1)
//   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 SESSION_SECRET=... ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run start -- -p 3200   (terminal 2)
//   FIREBASE_DATABASE_EMULATOR_HOST=127.0.0.1:9000 ADMIN_USERNAME=admin ADMIN_PASSWORD=... npm run smoke     (terminal 3)
// Seeds a few plots, signs in, loads every public and admin endpoint, and asserts the numbers.
const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3200";
const MOCK = `http://${process.env.FIREBASE_DATABASE_EMULATOR_HOST ?? "127.0.0.1:9000"}`;
const USER = process.env.ADMIN_USERNAME ?? "admin";
const PASS = process.env.ADMIN_PASSWORD ?? "ChangeMe#12345";

let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
  if (!ok) failures++;
};
let cookie = "";
async function api(path: string, init: RequestInit = {}) {
  const res = await fetch(`${BASE}${path}`, { ...init, headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}), ...init.headers } });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const text = await res.text();
  let json: any = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, json, text };
}
const noNaN = (v: unknown) => !/NaN|undefined|Infinity/.test(JSON.stringify(v));

async function main() {
  await fetch(`${MOCK}/__reset`);
  const M = getCurrentMonth(), M1 = getPreviousMonth(M), M2 = getPreviousMonth(M1), M3 = getPreviousMonth(M2);
  const first = (m: string) => new Date(`${m}-01T00:00:00.000Z`);
  const base = { phoneNumbers: [], advanceAmount: 0, advancePaid: 0, advancePaidDate: null, advanceNotes: null, active: true };
  const u1 = await createUnit({ ...base, plotNumber: "101", tenantName: "Ravi Kumar", moveInDate: first(M3), monthlyRent: 20000, maintenanceAmount: 1000 });
  const u2 = await createUnit({ ...base, plotNumber: "102", tenantName: "Anita Rao", moveInDate: first(M), monthlyRent: 15000, maintenanceAmount: 500 });
  await createUnit({ ...base, plotNumber: "103", tenantName: null, moveInDate: null, monthlyRent: 0, maintenanceAmount: 0 });
  const pay = (month: string, paid: number, prev: number, curr: number, d: string | null) =>
    savePayment(u1.id, month, { paymentStatus: paid >= 21000 ? "PAID" : "UNPAID", rentAmount: 20000, maintenanceAmount: 1000, amountPaid: paid, balanceDue: 21000 - paid, paidDate: d ? new Date(d) : null, notes: null, prevReading: prev, currReading: curr, electricityAmount: 0, electricityPaid: false, updatedBy: "smoke" });
  await pay(M2, 21000, 100, 140, `${M2}-05T00:00:00.000Z`);
  await pay(M1, 21000, 140, 190, `${M1}-05T00:00:00.000Z`);
  await pay(M, 0, 0, 0, null); // no reading yet -> fixed default bill (101 is a "high" plot: 750)
  void u2;
  console.log(`Seeded plots 101 (moved in ${M3}), 102 (moved in ${M}), 103 (vacant); months ${M2}, ${M1}, ${M}\n`);

  console.log("Public status (no login)");
  const pub = await api(`/api/public/status?month=${M}`);
  check("200 and JSON", pub.status === 200 && !!pub.json, pub.text.slice(0, 120));
  const plots = pub.json?.plots ?? [];
  const p = (n: string) => plots.find((x: any) => x.plotNumber === n);
  check("3 plots listed", plots.length === 3, plots.length);
  check("tenant names shown", p("101")?.tenantName === "Ravi Kumar", p("101")?.tenantName);
  check("101 rent counted (DUE/UNPAID)", ["DUE", "UNPAID"].includes(p("101")?.status), p("101")?.status);
  check("102 (moved in this month) rent N/A", p("102")?.status === "NA", p("102")?.status);
  check("102 electricity N/A", p("102")?.electricityStatus === "NA", p("102")?.electricityStatus);
  check("103 (vacant) N/A for rent and electricity", p("103")?.status === "NA" && p("103")?.electricityStatus === "NA");
  const months = p("101")?.electricityMonths ?? [];
  check("101 has 3 electricity months", months.length === 3, months.length);
  check("units math: 40 units = ₹280, 50 units = ₹350", months.find((m: any) => m.month === M2)?.bill === 280 && months.find((m: any) => m.month === M1)?.bill === 350, months.map((m: any) => [m.month, m.bill]));
  check("no-reading month bills fixed ₹750 (high plot)", months.find((m: any) => m.month === M)?.bill === 750 && months.find((m: any) => m.month === M)?.isDefault === true);
  check("electricity total due = 280 + 350 + 750", p("101")?.electricityTotals?.due === 1380, p("101")?.electricityTotals);
  check("no rent money, payment dates, contacts, notes or audit fields exposed", !/monthlyRent|rentAmount|rentTotals|maintenanceAmount|amountPaid|paidDate|phoneNumbers|notes|updatedBy|advance/.test(pub.text));
  check("public rent history contains all 3 rent months", p("101")?.rentMonths?.length === 3);
  check("public rent history is strictly month and status", p("101")?.rentMonths?.every((entry: any) => Object.keys(entry).sort().join(",") === "month,status"));
  check("public rent records retain payment status", p("101")?.rentMonths?.[0]?.status === "PAID");
  check("vacant plot has no rent history", p("103")?.rentMonths?.length === 0);
  check("public info has no NaN/undefined", noNaN(pub.json));
  const home = await api("/");
  check("home page renders", home.status === 200 && home.text.includes("<html"));
  check("manifest served", (await api("/manifest.webmanifest")).status === 200);

  console.log("\nAdmin login");
  check("admin endpoints are protected", (await api(`/api/admin/dashboard?month=${M}`)).status === 401);
  check("wrong password rejected", (await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: USER, password: "definitely-wrong-1" }) })).status === 401);
  const login = await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: USER, password: PASS }) });
  check("login succeeds and sets a cookie", login.status === 200 && cookie.startsWith("sjr_session="), login.json ?? login.text.slice(0, 150));
  check("/api/auth/me knows the admin", (await api("/api/auth/me")).json?.authenticated === true);

  console.log("\nAdmin data");
  const dash = await api(`/api/admin/dashboard?month=${M}`);
  check("dashboard 200", dash.status === 200, dash.text.slice(0, 120));
  check("dashboard lists 3 rows", dash.json?.rows?.length === 3, dash.json?.rows?.length);
  check("totals count only the tenant whose rent has started (1)", dash.json?.totals?.totalUnits === 1, dash.json?.totals);
  check("dashboard carries electricity config", dash.json?.electricityConfig?.ratePerUnit === 7);
  check("dashboard has no NaN/undefined", noNaN(dash.json));
  const hist = await api("/api/admin/payment-history");
  const t101 = hist.json?.tenants?.find((t: any) => t.plotNumber === "101");
  check("payment-history 200 with plot 101", hist.status === 200 && !!t101, hist.text.slice(0, 120));
  check("rent paid = 42,000 over 2 paid months", t101?.totals?.rentPaid === 42000, t101?.totals);
  check("electricity billed = 1,380", t101?.totals?.electricityBill === 1380, t101?.totals?.electricityBill);
  check("admin retains rent amounts", t101?.totals?.rentDue === 63000 && t101?.totals?.rentBalance === 21000);
  check("payment-history has no NaN/undefined", noNaN(hist.json));
  for (const path of ["/api/admin/rent-paid", "/api/admin/electricity/statement", "/api/admin/rental-history", "/api/admin/move-in-proration", `/api/admin/electricity?month=${M}`, "/api/admin/units", "/api/admin/settings"]) {
    const r = await api(path);
    check(`${path} 200 and clean JSON`, r.status === 200 && !!r.json && noNaN(r.json), r.status === 200 ? undefined : r.text.slice(0, 120));
  }
  const rp = await api("/api/admin/rent-paid");
  check("rent-paid: 101 balance reflects unpaid current month", rp.json?.tenants?.find((t: any) => t.plotNumber === "101")?.totalPaid === 42000, rp.json?.tenants?.[0]);

  console.log("\nSettings round-trip");
  const settings = (await api("/api/admin/settings")).json;
  const put = await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ electricity: { ...settings.electricity, ratePerUnit: 8, highPlots: "", plotFixed: "101=900" }, general: { ...settings.general, buildingName: "Test Building", showTenantNames: false } }) });
  check("settings saved", put.status === 200, put.json ?? put.text.slice(0, 120));
  const after = (await api("/api/admin/settings")).json;
  check("rate, per-plot fixed amount and empty high-plot list persisted", after?.electricity?.ratePerUnit === 8 && after?.electricity?.plotFixed?.["101"] === 900 && after?.electricity?.highPlots?.length === 0, after?.electricity);
  const pub2 = await api(`/api/public/status?month=${M}`);
  const p2 = pub2.json?.plots?.find((x: any) => x.plotNumber === "101");
  check("public page follows new rate (40 units x 8 = 320)", p2?.electricityMonths?.find((m: any) => m.month === M2)?.bill === 320, p2?.electricityMonths);
  check("per-plot fixed bill (₹900) applies to the unread month", p2?.electricityMonths?.find((m: any) => m.month === M)?.bill === 900);
  check("building name from settings", pub2.json?.buildingName === "Test Building");
  check("tenant names hidden when switched off", p2?.tenantName === null);

  const maskedSettings = { electricity: { ...after.electricity, highPlots: after.electricity.highPlots.join(", "), plotFixed: "101=900" }, general: { ...after.general, showTenantNames: true, maskTenantNames: true } };
  check("masking setting saved", (await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(maskedSettings) })).status === 200);
  const masked = (await api(`/api/public/status?month=${M}`)).json;
  check("public API returns first 3 characters only", masked?.plots?.find((x: any) => x.plotNumber === "101")?.tenantName === "Rav***");
  check("public JSON contains no full tenant name", !JSON.stringify(masked).includes("Ravi Kumar"));
  const adminUnits = (await api("/api/admin/units")).json;
  check("admin still sees original full name", adminUnits?.units?.find((x: any) => x.plotNumber === "101")?.tenantName === "Ravi Kumar");
  check("masking setting persists", (await api("/api/admin/settings")).json?.general?.maskTenantNames === true);
  const { maskTenantNames: omittedMask, ...legacyGeneral } = maskedSettings.general;
  void omittedMask;
  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...maskedSettings, general: legacyGeneral }) });
  check("legacy settings updates preserve active masking", (await api("/api/admin/settings")).json?.general?.maskTenantNames === true);
  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ ...maskedSettings, general: { ...maskedSettings.general, showTenantNames: false } }) });
  check("hidden mode wins over masking", (await api(`/api/public/status?month=${M}`)).json?.plots?.find((x: any) => x.plotNumber === "101")?.tenantName === null);

  await api("/api/admin/settings", { method: "PUT", body: JSON.stringify({ electricity: { ...settings.electricity, highPlots: settings.electricity.highPlots.join(", "), plotFixed: "" }, general: settings.general }) }); // restore

  console.log(failures ? `\n${failures} check(s) FAILED` : "\nAll checks passed");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
