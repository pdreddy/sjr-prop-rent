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
        <p className="plot-month-summary" aria-label="Selected month status">
          <strong>{formatMonthLabel(selectedMonth)}</strong>
          <span>
            Rent <StatusBadge status={plot.status} />
          </span>
          <span>
            Electricity <StatusBadge status={plot.electricityStatus ?? "NA"} />
          </span>
        </p>
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
                Rent shows payment status only. All amounts are electricity charges. Paid includes credits applied by the
                electricity ledger.
                {defaultMonths > 0 &&
                  ` ${defaultMonths} default-bill ${defaultMonths === 1 ? "month has" : "months have"} no recorded units and ${defaultMonths === 1 ? "is" : "are"} excluded from the unit total.`}
              </p>
              <div className="history-table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Month</th>
                      <th scope="col">Rent status</th>
                      <th scope="col">Units</th>
                      <th scope="col">Bill</th>
                      <th scope="col">Paid / credited</th>
                      <th scope="col">Balance due</th>
                      <th scope="col">Electricity status</th>
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
                        <td data-label="Rent">
                          <StatusBadge status={rentMonths.find((rent) => rent.month === entry.month)?.status ?? (entry.month === selectedMonth ? plot.status : "NA")} />
                        </td>
                        <td data-label="Units">
                          {entry.isDefault
                            ? "—"
                            : entry.units.toLocaleString("en-IN", {
                                maximumFractionDigits: 2,
                              })}
                        </td>
                        <td data-label="Bill">{rupee(entry.bill)}</td>
                        <td data-label="Paid">
                          {rupee(entry.paid)}
                        </td>
                        <td data-label="Due">{rupee(entry.balance)}</td>
                        <td data-label="Electricity">
                          <StatusBadge status={entry.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  {totals && (
                    <tfoot>
                      <tr>
                        <th scope="row">Total</th>
                        <td />
                        <td data-label="Units">
                          {totalUnits.toLocaleString("en-IN", {
                            maximumFractionDigits: 2,
                          })}
                          <small className="history-meter-readings">
                            Recorded only
                          </small>
                        </td>
                        <td data-label="Billed">
                          {rupee(totals.billed)}
                        </td>
                        <td data-label="Paid">
                          {rupee(totals.paid)}
                        </td>
                        <td data-label="Due">{rupee(totals.due)}</td>
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
