"use client";

import type { PublicPlot } from "@/lib/types";
import { formatDate, formatMonthLabel } from "@/lib/month";
import { rupee } from "@/lib/format";
import { Icon } from "@/components/public/Icon";
import StatusBadge from "@/components/StatusBadge";

const number = (value: number) =>
  value.toLocaleString("en-IN", { maximumFractionDigits: 2 });

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
      months.reduce((sum, entry) => sum + (entry.isDefault ? 0 : entry.units), 0) * 100,
    ) / 100;
  const maxUnits = Math.max(1, ...months.map((entry) => (entry.isDefault ? 0 : entry.units)));
  const defaultMonths = months.filter((entry) => entry.isDefault).length;
  // API totals describe the existing credit ledger; no billing rules change here.
  const totals = plot.electricityTotals;
  const paidShare =
    totals && totals.billed > 0
      ? Math.min(100, Math.round((totals.paid / totals.billed) * 100))
      : 0;
  const rentMonths = plot.rentMonths ?? [];
  const electricityStatus = plot.electricityStatus ?? "NA";
  return (
    <section
      id={`plot-history-${plot.plotNumber}`}
      className="plot-details"
      aria-labelledby={`plot-history-title-${plot.plotNumber}`}
    >
      <header className="plot-details-head">
        <div className="plot-details-title">
          <h2 id={`plot-history-title-${plot.plotNumber}`}>
            Plot {plot.plotNumber} details
          </h2>
          <p>
            {plot.tenantName ?? "Resident"} ·{" "}
            {plot.moveInDate
              ? `Joined ${formatDate(plot.moveInDate)}`
              : "Move-in date not recorded"}
          </p>
        </div>
        <p className="plot-month-summary" aria-label="Selected month status">
          <strong>{formatMonthLabel(selectedMonth)}</strong>
          <span>
            Rent <StatusBadge status={plot.status} size="sm" />
          </span>
          <span>
            Electricity <StatusBadge status={electricityStatus} size="sm" />
          </span>
        </p>
        <button
          className="plot-details-close"
          onClick={onClose}
          aria-label="Close plot details"
        >
          <Icon name="close" />
        </button>
      </header>

      <div className={`plot-details-body${months.length === 0 ? " is-empty" : ""}`}>
        <div className="plot-details-stats">
          <h3 id={`plot-electricity-title-${plot.plotNumber}`}>Electricity history</h3>
          {months.length === 0 ? (
            <p className="no-electricity-history">No electricity records yet.</p>
          ) : (
            <>
              <dl
                className="electricity-history-totals"
                aria-label="Electricity history totals"
              >
                {totals && (
                  <div className={`stat-due ${totals.due > 0 ? "is-due" : "is-clear"}`}>
                    <dt>Total due</dt>
                    <dd>{rupee(totals.due)}</dd>
                  </div>
                )}
                {totals && (
                  <>
                    <div>
                      <dt>Total billed</dt>
                      <dd>{rupee(totals.billed)}</dd>
                    </div>
                    <div>
                      <dt>Paid / credited</dt>
                      <dd>
                        {rupee(totals.paid)}
                        {totals.billed > 0 && <small>{paidShare}% of billed</small>}
                      </dd>
                      {totals.billed > 0 && (
                        <span className="kpi-bar" aria-hidden="true">
                          <i className="good" style={{ width: `${paidShare}%` }} />
                        </span>
                      )}
                    </div>
                  </>
                )}
                <div>
                  <dt>Recorded units</dt>
                  <dd>{number(totalUnits)}</dd>
                </div>
              </dl>
            </>
          )}
        </div>

        {months.length > 0 && (
          <div className="history-table-scroll">
            <table className="history-table" aria-labelledby={`plot-electricity-title-${plot.plotNumber}`}>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Rent</th>
                  <th scope="col" className="num">Units</th>
                  <th scope="col" className="num">Bill</th>
                  <th scope="col" className="num">Paid / credited</th>
                  <th scope="col" className="num">Balance due</th>
                  <th scope="col">Electricity</th>
                </tr>
              </thead>
              <tbody>
                {months.map((entry) => {
                  const selected = entry.month === selectedMonth;
                  return (
                    <tr
                      key={entry.month}
                      className={selected ? "is-selected-month" : undefined}
                      aria-current={selected ? "true" : undefined}
                    >
                      <th scope="row">
                        <span className="history-month">
                          {formatMonthLabel(entry.month)}
                          {selected && <span className="selected-month-label">Selected</span>}
                        </span>
                        <small className="history-meter-readings">
                          {entry.isDefault
                            ? "Default bill · no reading"
                            : `${entry.prevReading} → ${entry.currReading}`}
                        </small>
                      </th>
                      <td data-label="Rent">
                        <StatusBadge
                          size="sm"
                          status={
                            rentMonths.find((rent) => rent.month === entry.month)?.status ??
                            (selected ? plot.status : "NA")
                          }
                        />
                      </td>
                      <td data-label="Units" className="num">
                        {entry.isDefault ? (
                          "—"
                        ) : (
                          <span className="units">
                            {number(entry.units)}
                            <span className="unit-bar" aria-hidden="true">
                              <i style={{ width: `${Math.round((entry.units / maxUnits) * 100)}%` }} />
                            </span>
                          </span>
                        )}
                      </td>
                      <td data-label="Bill" className="num">{rupee(entry.bill)}</td>
                      <td data-label="Paid" className="num">{rupee(entry.paid)}</td>
                      <td data-label="Due" className={`num${entry.balance > 0 ? " is-due" : ""}`}>
                        {rupee(entry.balance)}
                      </td>
                      <td data-label="Electricity">
                        <StatusBadge status={entry.status} size="sm" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              {totals && (
                <tfoot>
                  <tr>
                    <th scope="row">Total</th>
                    <td />
                    <td data-label="Units" className="num">
                      {number(totalUnits)}
                      <small className="history-meter-readings">Recorded only</small>
                    </td>
                    <td data-label="Billed" className="num">{rupee(totals.billed)}</td>
                    <td data-label="Paid" className="num">{rupee(totals.paid)}</td>
                    <td data-label="Due" className={`num${totals.due > 0 ? " is-due" : ""}`}>
                      {rupee(totals.due)}
                    </td>
                    <td />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
        {months.length > 0 && (
          <p className="history-ledger-note">
                Rent shows payment status only. All amounts are electricity charges. Paid includes credits applied by the
                electricity ledger.
                {defaultMonths > 0 &&
                  ` ${defaultMonths} default-bill ${defaultMonths === 1 ? "month has" : "months have"} no recorded units and ${defaultMonths === 1 ? "is" : "are"} excluded from the unit total.`}
          </p>
        )}
      </div>
    </section>
  );
}
