"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/public/Icon";
import StatusBadge from "@/components/StatusBadge";
import ElectricityHistory from "@/components/public/ElectricityHistory";
import { usePublicStatus } from "@/components/public/usePublicStatus";
import InstallApp from "@/components/InstallApp";
import {
  getCurrentMonth,
  getMonthOptions,
  formatDate,
  formatMonthLabel,
} from "@/lib/month";
import { rupee, shortMonth } from "@/lib/format";
import type { BuildingElectricity, PublicPlot } from "@/lib/types";

type Filter = "ALL" | "PENDING" | PublicPlot["status"];
type ElectricityFilter = "ALL" | PublicPlot["electricityStatus"];
const monthOptions = getMonthOptions();

const RENT_FILTERS = [
  ["ALL", "All plots"],
  ["PAID", "Paid"],
  ["UNPAID", "Unpaid"],
  ["DUE", "Due"],
  ["PARTIAL", "Partial"],
  ["NA", "N/A"],
] as const;

// First visible character (grapheme) of the first two words, so emoji and non-Latin names stay intact.
const graphemes = new Intl.Segmenter(undefined, { granularity: "grapheme" });
const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => graphemes.segment(word)[Symbol.iterator]().next().value?.segment ?? "")
    .join("");

const percent = (part: number, whole: number) =>
  whole > 0 ? Math.round((part / whole) * 100) : 0;

/** The building's own power bill next to the total billed to tenants, and the gap between them. */
function BuildingElectricityBand({
  building,
  month,
}: {
  building: BuildingElectricity;
  month: string;
}) {
  const { actualBill, billedToTenants } = building;
  const difference =
    actualBill === null
      ? null
      : Math.round((actualBill - billedToTenants) * 100) / 100;
  const share =
    actualBill && actualBill > 0
      ? Math.min(100, Math.round((billedToTenants / actualBill) * 100))
      : 0;
  return (
    <section
      className="building-electricity"
      aria-labelledby="building-electricity-title"
    >
      <div className="building-electricity-title">
        <h2 id="building-electricity-title">
          <Icon name="bolt" /> Building electricity
        </h2>
        <p>{formatMonthLabel(month)}</p>
      </div>
      <dl>
        <div>
          <dt>Building&rsquo;s power bill</dt>
          <dd className={actualBill === null ? "is-pending" : ""}>
            {actualBill === null ? "Not entered yet" : rupee(actualBill)}
          </dd>
        </div>
        <div>
          <dt>Billed to tenants</dt>
          <dd>{rupee(billedToTenants)}</dd>
        </div>
        <div className={difference ? "is-difference" : ""}>
          <dt>Difference</dt>
          <dd>
            {difference === null ? "—" : rupee(Math.abs(difference))}
            {difference !== null && (
              <small>
                {difference > 0
                  ? "not billed to tenants"
                  : difference < 0
                    ? "billed above the building’s bill"
                    : "bills match"}
              </small>
            )}
          </dd>
        </div>
      </dl>
      {actualBill !== null && actualBill > 0 && (
        <p className="building-electricity-share">
          <span className="kpi-bar" aria-hidden="true">
            <i className="good" style={{ width: `${share}%` }} />
          </span>
          <span>
            Tenant bills cover {Math.round((billedToTenants / actualBill) * 100)}% of the building&rsquo;s bill
          </span>
        </p>
      )}
    </section>
  );
}

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const { data, loading, refreshing, error, online, updatedAt, refresh } =
    usePublicStatus(month);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);
  const toggleHistory = (plotNumber: string) => {
    setExpandedPlot((current) => (current === plotNumber ? null : plotNumber));
  };
  const closeHistory = (plotNumber: string) => {
    setExpandedPlot(null);
    document.getElementById(`plot-trigger-${plotNumber}`)?.focus();
  };
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [electricityFilter, setElectricityFilter] =
    useState<ElectricityFilter>("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const resetFilters = () => {
    setFilter("ALL");
    setElectricityFilter("ALL");
    setAttentionOnly(false);
    setQuery("");
  };

  const allPlots = data?.plots ?? [];
  const electricityOf = (plot: PublicPlot) => plot.electricityStatus ?? "NA";
  const needsAttention = (plot: PublicPlot) =>
    plot.status === "UNPAID" ||
    plot.status === "PARTIAL" ||
    electricityOf(plot) === "UNPAID" ||
    electricityOf(plot) === "PARTIAL";
  const attentionCount = allPlots.filter(needsAttention).length;
  const rentCounts = { ALL: allPlots.length, PAID: 0, UNPAID: 0, DUE: 0, PARTIAL: 0, NA: 0 };
  const electricityCounts = { ALL: allPlots.length, PAID: 0, UNPAID: 0, PARTIAL: 0, NA: 0 };
  let electricityDueThisMonth = 0;
  for (const plot of allPlots) {
    rentCounts[plot.status] += 1;
    electricityCounts[electricityOf(plot)] += 1;
    if (electricityOf(plot) !== "NA") electricityDueThisMonth += plot.electricityBalance ?? 0;
  }
  const rentAttentionCount = rentCounts.UNPAID + rentCounts.PARTIAL;
  const electricityAttentionCount =
    electricityCounts.UNPAID + electricityCounts.PARTIAL;
  const electricityEligible = allPlots.length - electricityCounts.NA;
  const ready = !loading && data !== null;
  const eligiblePlots = allPlots.length - rentCounts.NA;
  const rentPending = eligiblePlots - (data?.paidCount ?? 0);
  const rentPercentage = percent(data?.paidCount ?? 0, eligiblePlots);
  const electricityPercentage = percent(electricityCounts.PAID, electricityEligible);
  const pendingParts = (
    [
      [rentCounts.UNPAID, "unpaid"],
      [rentCounts.DUE, "due"],
      [rentCounts.PARTIAL, "partial"],
    ] as const
  )
    .filter(([count]) => count > 0)
    .map(([count, label]) => `${count} ${label}`);

  const filtersActive =
    filter !== "ALL" || electricityFilter !== "ALL" || attentionOnly || query !== "";
  const plots = allPlots.filter(
    (plot) =>
      (filter === "ALL" ||
        (filter === "PENDING"
          ? plot.status !== "PAID" && plot.status !== "NA"
          : plot.status === filter)) &&
      (electricityFilter === "ALL" || electricityOf(plot) === electricityFilter) &&
      (!attentionOnly || needsAttention(plot)) &&
      `${plot.plotNumber} ${plot.tenantName ?? ""}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
  );

  return (
    <div className="portal">
      <a className="skip-link" href="#resident-list">
        Skip to rent status
      </a>
      <header className="portal-header">
        <div className="portal-container portal-header-inner">
          <Link className="portal-brand" href="/" aria-label="SJR Building home">
            <span className="portal-brand-mark">
              <Icon name="building" />
            </span>
            <span className="portal-brand-text">
              <strong>{data?.buildingName ?? "SJR Building"}</strong>
              <span>Resident portal</span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="portal-nav">
            <InstallApp />
            <Link className="portal-admin-link" href="/admin/login">
              <Icon name="lock" />
              <span>Admin login</span>
            </Link>
          </nav>
        </div>
      </header>

      <main className="portal-container portal-main">
        <div className="portal-hero">
          <div className="portal-hero-title">
            <h1>Monthly rent status</h1>
            <p>
              Rent and electricity for every plot
              {ready ? ` · ${formatMonthLabel(month)}` : ""}
            </p>
          </div>
          <div className="portal-hero-actions">
            <div className="month-picker">
              <label htmlFor="public-month">Viewing month</label>
              <div>
                <Icon name="calendar" />
                <select
                  id="public-month"
                  value={month}
                  onChange={(event) => setMonth(event.target.value)}
                >
                  {monthOptions.map((option) => (
                    <option key={option} value={option}>
                      {formatMonthLabel(option)}
                    </option>
                  ))}
                </select>
                <Icon name="chevron" />
              </div>
            </div>
            <button
              className={`refresh-button ${refreshing ? "is-refreshing" : ""}`}
              onClick={refresh}
              disabled={loading || refreshing || !online}
            >
              <Icon name="refresh" />
              <span>{refreshing ? "Refreshing" : "Refresh"}</span>
            </button>
          </div>
        </div>

        {data?.notice && (
          <aside className="portal-notice">
            <Icon name="alert" />
            <span>{data.notice}</span>
          </aside>
        )}

        <section className="kpi-grid" aria-label="Monthly summary">
          <button
            type="button"
            className="kpi kpi-plots"
            aria-label="Show all plots"
            aria-pressed={!filtersActive}
            onClick={resetFilters}
            disabled={!ready}
          >
            <span className="kpi-label">
              <Icon name="building" /> Plots
            </span>
            <strong className="kpi-value">{ready ? data.totalPlots : "—"}</strong>
            <span className="kpi-sub">
              {ready ? `${eligiblePlots} with rent this month` : " "}
            </span>
          </button>
          <button
            type="button"
            className="kpi"
            aria-label="Show paid rent"
            aria-pressed={filter === "PAID"}
            onClick={() => setFilter(filter === "PAID" ? "ALL" : "PAID")}
            disabled={!ready}
          >
            <span className="kpi-label">
              <Icon name="check" /> Rent paid
            </span>
            <strong className="kpi-value">
              {ready ? data.paidCount : "—"}
              {ready && <span className="kpi-of"> / {eligiblePlots}</span>}
              {ready && <small className="kpi-pct good">{rentPercentage}%</small>}
            </strong>
            <span className="kpi-bar" aria-hidden="true">
              <i className="good" style={{ width: `${ready ? rentPercentage : 0}%` }} />
            </span>
          </button>
          <button
            type="button"
            className="kpi"
            aria-label="Show pending rent"
            aria-pressed={filter === "PENDING"}
            onClick={() => setFilter(filter === "PENDING" ? "ALL" : "PENDING")}
            disabled={!ready}
          >
            <span className="kpi-label">
              <Icon name="clock" /> Rent pending
            </span>
            <strong className={`kpi-value ${ready && rentPending > 0 ? "warn" : ""}`}>
              {ready ? rentPending : "—"}
            </strong>
            <span className="kpi-sub">
              {ready ? (pendingParts.length ? pendingParts.join(" · ") : "Nothing pending") : " "}
            </span>
          </button>
          <button
            type="button"
            className="kpi"
            aria-label="Show paid electricity"
            aria-pressed={electricityFilter === "PAID"}
            onClick={() =>
              setElectricityFilter(electricityFilter === "PAID" ? "ALL" : "PAID")
            }
            disabled={!ready}
          >
            <span className="kpi-label">
              <Icon name="bolt" /> Electricity paid
            </span>
            <strong className="kpi-value">
              {ready ? electricityCounts.PAID : "—"}
              {ready && <span className="kpi-of"> / {electricityEligible}</span>}
            </strong>
            <span className="kpi-bar" aria-hidden="true">
              <i className="good" style={{ width: `${ready ? electricityPercentage : 0}%` }} />
            </span>
          </button>
          <button
            type="button"
            className="kpi"
            aria-label="Show unpaid electricity"
            aria-pressed={electricityFilter === "UNPAID"}
            onClick={() =>
              setElectricityFilter(electricityFilter === "UNPAID" ? "ALL" : "UNPAID")
            }
            disabled={!ready}
          >
            <span className="kpi-label">
              <Icon name="alert" /> Electricity due
            </span>
            <strong className={`kpi-value ${ready && electricityDueThisMonth > 0 ? "bad" : ""}`}>
              {ready ? rupee(Math.round(electricityDueThisMonth * 100) / 100) : "—"}
            </strong>
            <span className="kpi-sub">
              {ready
                ? electricityAttentionCount
                  ? `${electricityAttentionCount} ${electricityAttentionCount === 1 ? "plot" : "plots"} · ${shortMonth(month)}`
                  : "Nothing due this month"
                : " "}
            </span>
          </button>
        </section>

        {ready && data.buildingElectricity && (
          <BuildingElectricityBand
            building={data.buildingElectricity}
            month={month}
          />
        )}

        <section
          id="resident-list"
          className="directory"
          aria-labelledby="directory-title"
          aria-busy={loading || refreshing}
        >
          <div className="directory-toolbar">
            <h2 id="directory-title">
              Resident directory
              <span className="plot-count">
                {ready
                  ? filtersActive
                    ? `${plots.length} of ${data.totalPlots}`
                    : `${data.totalPlots} plots`
                  : "—"}
              </span>
            </h2>
            <label className="resident-search">
              <Icon name="search" />
              <span className="sr-only">Search plots or residents</span>
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search plot or resident…"
              />
            </label>
            <div
              className="status-filters"
              role="group"
              aria-label="Filter by payment status"
            >
              {RENT_FILTERS.map(([value, label]) => (
                <button
                  key={value}
                  aria-pressed={filter === value}
                  aria-describedby={`rent-status-count-${value}`}
                  onClick={() => setFilter(value)}
                  className={filter === value ? "selected" : ""}
                >
                  {value !== "ALL" && (
                    <span className={`filter-dot ${value.toLowerCase()}`} />
                  )}
                  {label}
                  <span id={`rent-status-count-${value}`} hidden>
                    {ready
                      ? `${rentCounts[value]} plots in ${formatMonthLabel(month)}`
                      : "Loading counts"}
                  </span>
                  <span className="status-count" aria-hidden="true">
                    {ready ? rentCounts[value] : "—"}
                  </span>
                </button>
              ))}
            </div>
            <div className="secondary-filters">
              <label className="electricity-filter">
                <Icon name="bolt" />
                <span>Electricity</span>
                <select
                  aria-label="Filter electricity status"
                  value={electricityFilter}
                  onChange={(event) =>
                    setElectricityFilter(event.target.value as ElectricityFilter)
                  }
                >
                  <option value="ALL">
                    All ({ready ? electricityCounts.ALL : "—"})
                  </option>
                  <option value="PAID">
                    Paid ({ready ? electricityCounts.PAID : "—"})
                  </option>
                  <option value="UNPAID">
                    Unpaid ({ready ? electricityCounts.UNPAID : "—"})
                  </option>
                  <option value="PARTIAL">
                    Partial ({ready ? electricityCounts.PARTIAL : "—"})
                  </option>
                  <option value="NA">
                    N/A ({ready ? electricityCounts.NA : "—"})
                  </option>
                </select>
              </label>
              <label
                className={`attention-toggle ${attentionOnly ? "is-on" : ""}`}
                title="Unpaid or partial rent, or unpaid electricity. A plot can be counted for both."
              >
                <input
                  type="checkbox"
                  checked={attentionOnly}
                  onChange={(event) => setAttentionOnly(event.target.checked)}
                />
                <span className="attention-copy">
                  <span>
                    Needs attention <b>{ready ? attentionCount : "—"}</b>
                  </span>
                  <span className="attention-breakdown">
                    Rent <strong>{ready ? rentAttentionCount : "—"}</strong> ·
                    Electricity{" "}
                    <strong>{ready ? electricityAttentionCount : "—"}</strong>
                  </span>
                </span>
              </label>
            </div>
          </div>

          {data && (!online || error) && (
            <div className="connection-note" role="status">
              <Icon name={online ? "refresh" : "cloud"} />
              <span>
                {!online
                  ? "You’re offline. Showing the last loaded status."
                  : "Couldn’t refresh. Showing the last loaded status."}
              </span>
              {online && (
                <button onClick={refresh} disabled={refreshing}>
                  Try again
                </button>
              )}
            </div>
          )}

          {loading ? (
            <div className="directory-loading" role="status">
              <span className="sr-only">Loading rent status</span>
              {Array.from({ length: 6 }, (_, index) => (
                <div className="skeleton-row" key={index}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : (error || !online) && !data ? (
            <div className="directory-empty" role="alert">
              <span className="empty-icon">
                <Icon name="cloud" />
              </span>
              <h3>
                {online
                  ? "We couldn’t load the latest status."
                  : "A moment to reconnect."}
              </h3>
              <p>
                {online
                  ? "Check your connection, then give it another try."
                  : "Your building’s status will refresh when you’re back online."}
              </p>
              <button className="solid-button" onClick={refresh}>
                Try again <Icon name="refresh" />
              </button>
            </div>
          ) : ready && plots.length === 0 ? (
            <div className="directory-empty" role="status">
              <span className="empty-icon">
                <Icon name={data.totalPlots ? "search" : "building"} />
              </span>
              <h3>
                {data.totalPlots
                  ? "No matching plots"
                  : "A fresh start for your building."}
              </h3>
              <p>
                {data.totalPlots
                  ? "Try another name, plot number, or payment status."
                  : "Plots will appear here once an admin adds them."}
              </p>
              {data.totalPlots > 0 && (
                <button className="text-button" onClick={resetFilters}>
                  Clear filters <Icon name="arrow" />
                </button>
              )}
            </div>
          ) : (
            ready && (
              <div className="resident-table-wrap">
                <table
                  className="resident-table"
                  onKeyDown={(event) => {
                    if (event.key === "Escape" && expandedPlot) closeHistory(expandedPlot);
                  }}
                >
                  <thead>
                    <tr>
                      <th scope="col">Plot</th>
                      <th scope="col">Resident</th>
                      <th scope="col" className="move-in-col">Moved in</th>
                      <th scope="col">Rent</th>
                      <th scope="col">Electricity · {shortMonth(month)}</th>
                      <th scope="col" className="num">Total electricity due</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plots.map((plot, index) => {
                      const expanded = expandedPlot === plot.plotNumber;
                      const electricity = electricityOf(plot);
                      const bill = plot.electricityAmount;
                      const balance = plot.electricityBalance ?? 0;
                      const totalDue = plot.electricityTotals?.due ?? 0;
                      return (
                        <Fragment key={plot.plotNumber}>
                          <tr
                            className={`plot-history-row${expanded ? " is-expanded" : ""}`}
                            onClick={() => toggleHistory(plot.plotNumber)}
                          >
                            <th scope="row">
                              <button
                                className="plot-row-trigger"
                                aria-label={`View details for plot ${plot.plotNumber}`}
                                id={`plot-trigger-${plot.plotNumber}`}
                                aria-expanded={expanded}
                                aria-controls={`plot-history-${plot.plotNumber}`}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleHistory(plot.plotNumber);
                                }}
                              >
                                {plot.plotNumber}
                                <Icon name="chevron" />
                              </button>
                            </th>
                            <td className="resident-cell">
                              <div className="resident-name">
                                <span
                                  className={`resident-avatar avatar-${index % 4}`}
                                  aria-hidden="true"
                                >
                                  {plot.tenantName ? (
                                    initials(plot.tenantName)
                                  ) : (
                                    <Icon name="home" />
                                  )}
                                </span>
                                <span className="resident-text">
                                  <span className={plot.tenantName ? "" : "is-muted"}>
                                    {plot.tenantName ?? "Not displayed"}
                                  </span>
                                  <span className="mobile-date">
                                    {plot.moveInDate
                                      ? `Joined ${formatDate(plot.moveInDate)}`
                                      : "Move-in date unavailable"}
                                  </span>
                                </span>
                              </div>
                            </td>
                            <td className="move-in-date">{formatDate(plot.moveInDate)}</td>
                            <td className="rent-cell">
                              <small className="cell-label">Rent</small>
                              <StatusBadge status={plot.status} size="sm" />
                            </td>
                            <td className="electricity-cell">
                              <div className="plot-payment-status">
                                <small className="cell-label">Electricity</small>
                                {electricity !== "NA" && Number.isFinite(bill) && (
                                  <span className="amount">{rupee(bill)}</span>
                                )}
                                <StatusBadge status={electricity} size="sm" />
                                {electricity === "PARTIAL" && balance > 0 && (
                                  <small className="payment-detail">{rupee(balance)} due</small>
                                )}
                              </div>
                            </td>
                            <td className="total-due-cell">
                              {totalDue > 0 ? (
                                <span className="plot-total-due">
                                  {rupee(totalDue)}
                                  <small> total due</small>
                                </span>
                              ) : (
                                <span className="settled">{plot.tenantName ? "Settled" : "—"}</span>
                              )}
                            </td>
                          </tr>
                          {expanded && (
                            <tr className="plot-history-expansion">
                              <td colSpan={6}>
                                <ElectricityHistory
                                  plot={plot}
                                  selectedMonth={month}
                                  onClose={() => closeHistory(plot.plotNumber)}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}
          <div className="directory-footer">
            <span role="status">
              {ready
                ? `Showing ${plots.length} of ${data.totalPlots} plots · ${formatMonthLabel(month)}`
                : "Payment status is updated by your building admin"}
            </span>
            {ready && updatedAt && (
              <span>
                Updated {updatedAt} · {online ? "Auto refresh" : "Offline"}
              </span>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
