/* eslint-disable @typescript-eslint/no-explicit-any -- a test script reading loosely typed JSON responses */
import { getMonthOptions } from "../src/lib/month";

// Cross-tab consistency check: every screen must show the same rent and electricity figures for the
// same plot and month. Loads every admin tab's endpoint plus the public page from a running app and
// compares them plot by plot, month by month. Works on whatever data the app holds.
//   SMOKE_BASE_URL=http://127.0.0.1:3000 ADMIN_USERNAME=admin ADMIN_PASSWORD=admin123 npx tsx scripts/cross-check.ts
// `npm run smoke` runs it too, with the session it already has.

type Api = (path: string) => Promise<{ status: number; json: any }>;
type Check = (name: string, ok: boolean, detail?: unknown) => void;

const near = (a: unknown, b: unknown) => typeof a === "number" && typeof b === "number" && Math.abs(a - b) < 0.006;
const sum = (rows: any[], pick: (row: any) => number) => Math.round(rows.reduce((s, r) => s + pick(r), 0) * 100) / 100;

export async function crossCheck(api: Api, check: Check, monthCount = 6) {
  const [history, statement, rentPaid, rental] = await Promise.all(
    ["/api/admin/payment-history", "/api/admin/electricity/statement", "/api/admin/rent-paid", "/api/admin/rental-history"].map(async (p) => (await api(p)).json),
  );
  const mismatches: Record<string, string[]> = {};
  const expect = (rule: string, ok: boolean, where: string, detail?: unknown) => {
    mismatches[rule] ??= [];
    if (!ok) mismatches[rule].push(`${where}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
  };
  const ledgerOf = (plot: string) => history?.tenants?.find((t: any) => t.plotNumber === plot);

  for (const month of getMonthOptions(monthCount)) {
    const [dash, pub, meter, summary] = await Promise.all(
      [`/api/admin/dashboard?month=${month}`, `/api/public/status?month=${month}`, `/api/admin/electricity?month=${month}`, `/api/admin/summary?month=${month}`].map(async (p) => (await api(p)).json),
    );
    for (const row of dash?.rows ?? []) {
      const plot = row.unit.plotNumber, where = `plot ${plot} ${month}`, view = row.view;
      const publicPlot = pub?.plots?.find((p: any) => p.plotNumber === plot);
      const meterRow = meter?.rows?.find((r: any) => r.plotNumber === plot);
      const ledger = ledgerOf(plot);
      const ledgerMonth = ledger?.months?.find((m: any) => m.month === month && !m.unapplied);

      // Overview vs public page.
      expect("Overview and public page show the same rent status", publicPlot?.status === view.rent.status || (publicPlot?.status === "DUE" && view.rent.status === "UNPAID"), where, [view.rent.status, publicPlot?.status]);
      expect("Overview and public page show the same electricity status", publicPlot?.electricityStatus === view.electricity.status, where, [view.electricity.status, publicPlot?.electricityStatus]);
      expect("Overview and public page show the same electricity bill and balance", near(publicPlot?.electricityAmount, view.electricity.bill) && near(publicPlot?.electricityBalance, view.electricity.balance), where, [view.electricity, publicPlot?.electricityAmount, publicPlot?.electricityBalance]);

      // Public row vs the public history under it.
      const publicRent = publicPlot?.rentMonths?.find((m: any) => m.month === month);
      if (publicRent) expect("Public month status matches its own rent history row", publicRent.status === publicPlot.status, where, [publicPlot.status, publicRent.status]);
      const publicElectricity = publicPlot?.electricityMonths?.find((m: any) => m.month === month);
      if (publicElectricity) expect("Public month status matches its own electricity history row", publicElectricity.status === publicPlot.electricityStatus && near(publicElectricity.bill, publicPlot.electricityAmount) && near(publicElectricity.balance, publicPlot.electricityBalance), where, [publicElectricity, publicPlot.electricityStatus]);

      // Overview vs Meter readings.
      expect("Overview and Meter readings show the same electricity bill, paid and balance", near(meterRow?.electricityAmount, view.electricity.bill) && near(meterRow?.electricityCovered, view.electricity.covered) && near(meterRow?.electricityBalance, view.electricity.balance), where, [view.electricity, meterRow]);
      if (ledger) expect("Meter readings total due matches Payment history", near(meterRow?.outstandingTotal, ledger.totals.electricityBalance), where, [meterRow?.outstandingTotal, ledger.totals.electricityBalance]);

      // Overview vs Payment history (the ledger).
      if (ledger?.firstRentMonth && ledgerMonth && view.applicable) {
        expect("Overview and Payment history show the same rent due and balance", near(ledgerMonth.rentDue, view.rent.due) && near(ledgerMonth.rentBalance, view.rent.balance) && ledgerMonth.rentStatus === view.rent.status, where, [view.rent, ledgerMonth.rentDue, ledgerMonth.rentBalance, ledgerMonth.rentStatus]);
      }
      if (ledgerMonth?.recorded) {
        const status = ledgerMonth.electricityStatus === "NONE" ? "NA" : ledgerMonth.electricityStatus;
        expect("Overview and Payment history show the same electricity", status === view.electricity.status && (status === "NA" || (near(ledgerMonth.electricityBill, view.electricity.bill) && near(ledgerMonth.electricityBalance, view.electricity.balance))), where, [view.electricity, ledgerMonth.electricityBill, ledgerMonth.electricityBalance, status]);
      }
    }

    // Summary vs Overview (same month).
    const rows = (dash?.rows ?? []).filter((r: any) => !r.isVacant);
    const applicable = rows.filter((r: any) => r.view.applicable);
    expect("Summary and Overview agree on rent expected, collected and outstanding", near(summary?.rent?.expected, dash?.totals?.totalExpected) && near(summary?.rent?.collected, dash?.totals?.totalCollected) && near(summary?.rent?.outstanding, dash?.totals?.outstandingBalance), month, [summary?.rent, dash?.totals]);
    expect("Summary and Overview agree on paid / partial / unpaid counts", summary?.rent?.counts?.paid === dash?.totals?.numPaid && summary?.rent?.counts?.partial === dash?.totals?.numPartial && summary?.rent?.counts?.unpaid === dash?.totals?.numUnpaid, month, [summary?.rent?.counts, dash?.totals]);
    expect("Overview outstanding is the sum of its rows' balances", near(dash?.totals?.outstandingBalance, sum(applicable, (r) => r.view.rent.balance)), month);
    expect("Summary electricity matches the Overview rows", near(summary?.electricity?.billed, sum(rows, (r) => r.view.electricity.bill)) && near(summary?.electricity?.due, sum(rows, (r) => r.view.electricity.balance)), month, [summary?.electricity?.billed, summary?.electricity?.due]);
    expect("Meter readings total matches Summary electricity billed", near(sum(meter?.rows ?? [], (r) => r.electricityAmount), summary?.electricity?.billed), month);
    const last = summary?.trend?.at(-1);
    expect("Summary trend's last month matches its own headline", near(last?.rentExpected, summary?.rent?.expected) && near(last?.rentCollected, summary?.rent?.collected) && near(last?.electricityBilled, summary?.electricity?.billed) && near(last?.electricityDue, summary?.electricity?.due), month, [last, summary?.rent, summary?.electricity]);
    expect("Public paid count matches Overview", pub?.paidCount === dash?.totals?.numPaid, month, [pub?.paidCount, dash?.totals?.numPaid]);
  }

  // History tabs against each other (they cover every month at once).
  for (const ledger of history?.tenants ?? []) {
    const where = `plot ${ledger.plotNumber}`;
    const billTab = statement?.tenants?.find((t: any) => t.plotNumber === ledger.plotNumber);
    for (const m of ledger.months.filter((x: any) => !x.unapplied)) {
      const s = billTab?.months?.find((x: any) => x.month === m.month);
      expect("Electricity bills and Payment history show the same bill, paid and balance", !!s && near(s.electricityBill, m.electricityBill) && near(s.credited, m.electricityCovered) && near(s.balance, m.electricityBalance) && s.status === m.electricityStatus, `${where} ${m.month}`, [s, m.electricityBill, m.electricityCovered, m.electricityBalance]);
    }
    expect("Electricity bills and Payment history totals agree", near(billTab?.totals?.bill, ledger.totals.electricityBill) && near(billTab?.totals?.balance, ledger.totals.electricityBalance), where, [billTab?.totals, ledger.totals]);
    const paidTab = rentPaid?.tenants?.find((t: any) => t.plotNumber === ledger.plotNumber);
    expect("Rent paid and Payment history totals agree", near(paidTab?.totalDue, ledger.totals.rentDue) && near(paidTab?.totalPaid, ledger.totals.rentPaid) && near(paidTab?.balance, ledger.totals.rentBalance), where, [paidTab, ledger.totals]);
    const stay = rental?.plots?.find((p: any) => p.plotNumber === ledger.plotNumber)?.stays?.find((s: any) => s.endMonth === null);
    if (ledger.firstRentMonth) {
      for (const m of stay?.months ?? []) {
        const row = ledger.months.find((x: any) => x.month === m.month && !x.beforeRentStart && !x.unapplied);
        if (row) expect("Rental history and Payment history show the same status and balance", m.status === row.rentStatus && near(m.balanceDue, row.rentBalance), `${where} ${m.month}`, [m.status, m.balanceDue, row.rentStatus, row.rentBalance]);
      }
    }
  }

  for (const [rule, failed] of Object.entries(mismatches)) check(rule, failed.length === 0, failed.slice(0, 5));
}

// Standalone: sign in and run against an already running app.
if (process.argv[1]?.endsWith("cross-check.ts")) {
  const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
  let cookie = "";
  let failures = 0;
  const api: Api = async (path) => {
    const res = await fetch(`${BASE}${path}`, { headers: cookie ? { cookie } : {} });
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  const check: Check = (name, ok, detail) => {
    console.log(`${ok ? "  ok  " : " FAIL "} ${name}${ok || detail === undefined ? "" : `  -> ${JSON.stringify(detail)}`}`);
    if (!ok) failures++;
  };
  (async () => {
    const login = await fetch(`${BASE}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: process.env.ADMIN_USERNAME ?? "admin", password: process.env.ADMIN_PASSWORD ?? "admin123" }),
    });
    cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";
    if (!login.ok) throw new Error(`Could not sign in to ${BASE} (${login.status}).`);
    await crossCheck(api, check);
    console.log(failures ? `\n${failures} check(s) FAILED` : "\nEvery tab agrees.");
    process.exit(failures ? 1 : 0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
