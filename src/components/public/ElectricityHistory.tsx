"use client";

import type { PublicPlot } from "@/lib/types";
import { formatDate, formatMonthLabel } from "@/lib/month";
import { rupee } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function ElectricityHistory({
  plot,
  selectedMonth,
  onClose,
}: {
  plot: PublicPlot;
  selectedMonth: string;
  onClose: () => void;
}) {
  const months = plot.electricityMonths ?? [];
  const selected = months.find((entry) => entry.month === selectedMonth);
  const applicable = plot.electricityStatus !== "NA";
  const totalUnits =
    Math.round(
      months.reduce(
        (sum, entry) => sum + (entry.isDefault ? 0 : entry.units),
        0,
      ) * 100,
    ) / 100;
  const defaultMonths = months.filter((entry) => entry.isDefault).length;
  // API totals describe the existing credit ledger; no billing rules change here.
  const totals = plot.electricityTotals;
  const rentMonths = plot.rentMonths ?? [];
  const rentTotals = plot.rentTotals;
  return (
    <section
      id={`plot-history-${plot.plotNumber}`}
      className="inline-plot-history"
      aria-labelledby={`plot-history-title-${plot.plotNumber}`}
    >
      <div className="history-dialog-inner">
        <div className="history-dialog-heading">
          <div>
            <p className="eyebrow">{plot.tenantName ?? "RESIDENT PORTAL"}</p>
            <h2 id={`plot-history-title-${plot.plotNumber}`}>
              Plot {plot.plotNumber} details
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close plot details"
          >
            ×
          </button>
        </div>
        <p className="history-dialog-note">
          {plot.moveInDate
            ? `Joined ${formatDate(plot.moveInDate)}`
            : "Move-in date not recorded"}{" "}
          · Viewing {formatMonthLabel(selectedMonth)}
        </p>
        <div className="plot-detail-panels">
          <section
            className="plot-month-detail"
            aria-label="Selected month rent"
          >
            <h3>Rent</h3>
            <StatusBadge status={plot.status} />
            <p>
              {plot.status === "NA"
                ? "Rent does not apply to this plot for the selected month."
                : plot.paidDate
                  ? `Payment recorded on ${formatDate(plot.paidDate)}`
                  : plot.status === "PAID"
                    ? "Marked paid. Payment date not recorded."
                    : "No paid date recorded."}
            </p>
          </section>
          <section
            className="plot-month-detail"
            aria-label="Selected month electricity"
          >
            <h3>Electricity</h3>
            <StatusBadge status={plot.electricityStatus ?? "NA"} />
            {selected ? (
              <p>
                {selected.isDefault ? "Default bill · no reading" : `${selected.prevReading} → ${selected.currReading} · ${selected.units.toLocaleString("en-IN", { maximumFractionDigits: 2 })} units`}
                <br />
                Bill {rupee(selected.bill)} · Paid {rupee(selected.paid)} · Due {rupee(selected.balance)}
              </p>
            ) : (
              <p>
                {!applicable
                  ? "Electricity does not apply to this plot for the selected month."
                  : `No electricity record for this month yet.${Number.isFinite(plot.electricityAmount) ? ` Estimated bill: ${rupee(plot.electricityAmount)}.` : ""}`}
              </p>
            )}
          </section>
        </div>
        <section className="public-rent-ledger" aria-labelledby="public-rent-ledger-title">
          <h3 id="public-rent-ledger-title">Rent history</h3>
          {rentMonths.length === 0 ? (
            <p className="no-electricity-history">No rent history available for this tenant yet.</p>
          ) : (
            <>
              {rentTotals && (
                <dl className="electricity-history-totals" aria-label="Rent history totals">
                  <div><dt>Total rent + maintenance</dt><dd>{rupee(rentTotals.billed)}</dd></div>
                  <div><dt>Total rent paid</dt><dd>{rupee(rentTotals.paid)}</dd></div>
                  <div><dt>Rent balance due</dt><dd>{rupee(rentTotals.due)}</dd></div>
                  <div><dt>Rent paid ahead</dt><dd>{rupee(rentTotals.advance)}</dd></div>
                </dl>
              )}
              <p className="history-ledger-note">
                Current tenant, through this month. Rent includes maintenance.
                Status is the recorded rent status; balances include rent paid ahead.
                Months without a record show the expected bill and no payment.
              </p>
              <div className="history-table-scroll">
                <table>
                  <thead><tr>
                    <th scope="col">Month</th><th scope="col">Rent + maintenance</th>
                    <th scope="col">Paid</th><th scope="col">Balance due</th>
                    <th scope="col">Payment date</th><th scope="col">Status</th>
                  </tr></thead>
                  <tbody>
                    {rentMonths.map((entry) => (
                      <tr key={entry.month} className={entry.month === selectedMonth ? "is-selected-month" : undefined}
                        aria-current={entry.month === selectedMonth ? "true" : undefined}>
                        <th scope="row">
                          {formatMonthLabel(entry.month)}
                          {entry.month === selectedMonth && <span className="selected-month-label">Selected</span>}
                          {!entry.recorded && <small className="history-meter-readings">No payment record</small>}
                          {entry.status === "NA" && <small className="history-meter-readings">Rent not yet applicable</small>}
                          {entry.advance > 0 && <small className="history-meter-readings">{rupee(entry.advance)} paid ahead</small>}
                        </th>
                        <td data-label="Rent + maintenance">{rupee(entry.bill)}</td>
                        <td data-label="Paid">{rupee(entry.paid)}</td>
                        <td data-label="Balance due">{rupee(entry.balance)}</td>
                        <td data-label="Payment date">{formatDate(entry.paidDate)}</td>
                        <td data-label="Status"><StatusBadge status={entry.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
        <section
          className="public-electricity-ledger"
          aria-labelledby="public-electricity-ledger-title"
        >
          <h3 id="public-electricity-ledger-title">Electricity history</h3>
          {months.length === 0 ? (
            <p className="no-electricity-history">
              No electricity records yet.
            </p>
          ) : (
            <>
              <dl
                className="electricity-history-totals"
                aria-label="Electricity history totals"
              >
                <div>
                  <dt>Recorded units</dt>
                  <dd>
                    {totalUnits.toLocaleString("en-IN", {
                      maximumFractionDigits: 2,
                    })}
                  </dd>
                </div>
                {totals && (
                  <>
                    <div>
                      <dt>Total billed</dt>
                      <dd>{rupee(totals.billed)}</dd>
                    </div>
                    <div>
                      <dt>Total paid / credited</dt>
                      <dd>{rupee(totals.paid)}</dd>
                    </div>
                    <div>
                      <dt>Total due</dt>
                      <dd>{rupee(totals.due)}</dd>
                    </div>
                  </>
                )}
              </dl>
              <p className="history-ledger-note">
                All recorded months. Paid includes credits applied by the
                electricity ledger.
                {defaultMonths > 0 &&
                  ` ${defaultMonths} default-bill ${defaultMonths === 1 ? "month has" : "months have"} no recorded units and ${defaultMonths === 1 ? "is" : "are"} excluded from the unit total.`}
              </p>
              <div className="history-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Units</th>
                      <th scope="col">Bill</th>
                      <th scope="col">Paid / credited</th>
                      <th scope="col">Balance due</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {months.map((entry) => (
                      <tr
                        key={entry.month}
                        className={
                          entry.month === selectedMonth
                            ? "is-selected-month"
                            : undefined
                        }
                        aria-current={
                          entry.month === selectedMonth ? "true" : undefined
                        }
                      >
                        <th scope="row">
                          {formatMonthLabel(entry.month)}
                          {entry.month === selectedMonth && (
                            <span className="selected-month-label">
                              Selected
                            </span>
                          )}
                          <small className="history-meter-readings">
                            {entry.isDefault
                              ? "Default bill · no reading"
                              : `${entry.prevReading} → ${entry.currReading}`}
                          </small>
                        </th>
                        <td data-label="Units used">
                          {entry.isDefault
                            ? "—"
                            : entry.units.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                        </td>
                        <td data-label="Bill">{rupee(entry.bill)}</td>
                        <td data-label="Paid / credited">
                          {rupee(entry.paid)}
                        </td>
                        <td data-label="Balance due">{rupee(entry.balance)}</td>
                        <td data-label="Status">
                          <StatusBadge status={entry.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td data-label="Recorded units">
                          {totalUnits.toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}
                          <small className="history-meter-readings">
                            Recorded only
                          </small>
                        </td>
                        <td data-label="Total billed">
                          {rupee(totals.billed)}
                        </td>
                        <td data-label="Total paid / credited">
                          {rupee(totals.paid)}
                        </td>
                        <td data-label="Total due">{rupee(totals.due)}</td>
                        <td />
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
