"use client";

import { formatDate, formatMonthLabel } from "@/lib/month";
import type { PaymentHistoryMonth } from "@/lib/types";

const rupees = (n: number) => `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;

export interface TenantContext {
  plotNumber: string;
  tenantName: string;
  moveInDate: string | null;
  firstRentMonth: string | null;
}

// Everything recorded for one tenant-month: rent, payment, electricity, credit and notes.
export default function PaymentMonthDetail({ tenant, month, ratePerUnit, monthLabel }: { tenant: TenantContext; month: PaymentHistoryMonth | null; ratePerUnit: number; monthLabel: string }) {
  return (
    <div className="bg-background px-3 py-3.5 sm:px-4">
      <p className="mb-2.5 text-sm font-bold text-primary-dark">
        Plot {tenant.plotNumber} · {tenant.tenantName} · {monthLabel}
        <span className="ml-2 font-normal text-foreground/55">
          Moved in {tenant.moveInDate ? formatDate(tenant.moveInDate) : "(date not set)"}
          {tenant.firstRentMonth ? ` · rent starts ${formatMonthLabel(tenant.firstRentMonth)}` : ""}
        </span>
      </p>

      {!month ? (
        <p className="rounded-xl border border-primary/10 bg-white px-3 py-2.5 text-sm text-foreground/65">
          No rent is due for this month{tenant.firstRentMonth ? ` — rent starts ${formatMonthLabel(tenant.firstRentMonth)}, the month after move-in` : ""}.
        </p>
      ) : (
        <div className="grid gap-3 md:grid-cols-3">
          <Card title="Rent">
            {month.beforeRentStart && <Note tone="warn">Filed under a month before this tenant&apos;s rent starts. It probably belongs to {tenant.firstRentMonth ? formatMonthLabel(tenant.firstRentMonth) : "the first rent month"}.</Note>}
            <Line label="Rent" value={rupees(month.rentAmount)} />
            <Line label="Maintenance" value={rupees(month.maintenanceAmount)} />
            {month.proratedDays !== null && <Line label="Move-in month" value={`${month.proratedDays}/30 days charged`} />}
            <Line label="Total rent due" value={rupees(month.rentDue)} strong />
            <Line label="Rent paid" value={rupees(month.rentPaid)} tone="paid" strong />
            <Line label="Paid on" value={month.paidDate ? formatDate(month.paidDate) : "—"} />
            <Line label="Rent balance" value={rupees(month.rentBalance)} tone={month.rentBalance > 0 ? "unpaid" : undefined} strong />
            <Line label="Status" value={month.recorded ? month.paymentStatus ?? "—" : "No record yet"} />
          </Card>

          <Card title="Electricity">
            <Line label="Meter reading" value={month.prevReading > 0 || month.currReading > 0 ? `${month.prevReading} → ${month.currReading}` : "Not entered"} />
            <Line label="Units used" value={String(month.electricityUnits)} />
            <Line label="Rate" value={`₹${ratePerUnit} / unit`} />
            <Line label="Electricity bill" value={rupees(month.electricityBill)} strong />
            <Line label="Paid / covered" value={rupees(month.electricityPaid)} tone="paid" strong />
            <Line label="Electricity balance" value={rupees(month.electricityBalance)} tone={month.electricityBalance > 0 ? "unpaid" : undefined} strong />
            <Line label="Marked paid by hand" value={month.electricityMarkedPaid ? "Yes" : "No"} />
            <Line label="Status" value={month.electricityStatus === "NONE" ? "No bill yet" : month.electricityStatus} />
          </Card>

          <Card title="Credit & notes">
            <Line label="Paid over rent this month" value={rupees(month.overpayment)} />
            <Line label="Credit carried forward" value={rupees(month.creditCarriedForward)} />
            <Line label="Notes" value={month.notes || "—"} wrap />
            <Line label="Last updated by" value={month.updatedBy || "—"} />
            <Line label="Last updated" value={month.updatedAt ? formatDate(month.updatedAt) : "—"} />
          </Card>
        </div>
      )}
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-primary/10 bg-white p-3">
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-foreground/45">{title}</p>
      <dl className="flex flex-col gap-1 text-sm">{children}</dl>
    </div>
  );
}

function Line({ label, value, strong, tone, wrap }: { label: string; value: string; strong?: boolean; tone?: "paid" | "unpaid"; wrap?: boolean }) {
  const color = tone === "paid" ? "text-paid" : tone === "unpaid" ? "text-unpaid" : "text-foreground";
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-foreground/60">{label}</dt>
      <dd className={`${strong ? "font-bold" : "font-medium"} ${color} ${wrap ? "whitespace-pre-line text-right" : "text-right"}`}>{value}</dd>
    </div>
  );
}

function Note({ children, tone }: { children: React.ReactNode; tone: "warn" }) {
  return <p className={`mb-1 rounded-lg px-2 py-1.5 text-xs ${tone === "warn" ? "bg-partial-bg text-partial" : ""}`}>{children}</p>;
}
