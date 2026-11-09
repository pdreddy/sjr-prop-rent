"use client";

import { useState } from "react";
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
import type { PublicPlot } from "@/lib/types";

type Filter = "ALL" | "PENDING" | PublicPlot["status"];
const monthOptions = getMonthOptions();

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const { data, loading, refreshing, error, online, updatedAt, refresh } =
    usePublicStatus(month);
  const [historyPlot, setHistoryPlot] = useState<PublicPlot | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [electricityFilter, setElectricityFilter] = useState<
    "ALL" | "PAID" | "UNPAID" | "NA"
  >("ALL");
  const [attentionOnly, setAttentionOnly] = useState(false);
  const needsAttention = (plot: PublicPlot) =>
    plot.status === "UNPAID" ||
    plot.status === "PARTIAL" ||
    plot.electricityStatus === "UNPAID";
  const attentionCount = data?.plots.filter(needsAttention).length ?? 0;
  const rentCounts = {
    ALL: data?.plots.length ?? 0,
    PAID: 0,
    UNPAID: 0,
    DUE: 0,
    PARTIAL: 0,
    NA: 0,
  };
  const electricityCounts = {
    ALL: data?.plots.length ?? 0,
    PAID: 0,
    UNPAID: 0,
    NA: 0,
  };
  for (const plot of data?.plots ?? []) {
    rentCounts[plot.status] += 1;
    electricityCounts[plot.electricityStatus ?? "NA"] += 1;
  }
  const rentAttentionCount = rentCounts.UNPAID + rentCounts.PARTIAL;

  const electricityEligible =
    data?.plots.filter(
      (plot) => plot.electricityStatus && plot.electricityStatus !== "NA",
    ).length ?? 0;
  const electricityPaid =
    data?.plots.filter((plot) => plot.electricityStatus === "PAID").length ?? 0;
  const ready = !loading && data !== null;
  const eligiblePlots =
    data?.plots.filter((plot) => plot.status !== "NA").length ?? 0;
  const percentage =
    eligiblePlots && data
      ? Math.round((data.paidCount / eligiblePlots) * 100)
      : 0;
  const plots =
    data?.plots.filter(
      (plot) =>
        (filter === "ALL" ||
          (filter === "PENDING"
            ? plot.status !== "PAID" && plot.status !== "NA"
            : plot.status === filter)) &&
        (electricityFilter === "ALL" ||
          plot.electricityStatus === electricityFilter) &&
        (!attentionOnly || needsAttention(plot)) &&
        `${plot.plotNumber} ${plot.tenantName ?? ""}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ) ?? [];

  return (
    <div className="public-site resident-portal">
      <a className="skip-link" href="#resident-list">
        Skip to rent status
      </a>
      <header className="site-header">
        <div className="public-container header-inner">
          <Link className="brand" href="/" aria-label="SJR Building home">
            <span className="brand-mark">
              <Icon name="building" />
            </span>
            <span>
              <strong>{data?.buildingName ?? "SJR Building"}</strong>
              <span>THE RESIDENT PORTAL</span>
            </span>
          </Link>
          <nav aria-label="Main navigation" className="header-actions">
            <span className="public-view">
              <span /> Public view
            </span>
            <Link className="admin-link" href="/admin/login">
              <Icon name="lock" />
              <span>Admin login</span>
              <Icon name="arrow" />
            </Link>
          </nav>
        </div>
      </header>
      <main className="public-container public-main">
        <div className="page-intro">
          <div>
            <h1>Monthly rent status</h1>
          </div>
          <div className="install-app">
            <InstallApp />
          </div>
        </div>
        {data?.notice && <aside className="public-notice">{data.notice}</aside>}
        <section className="month-summary" aria-label="Monthly summary">
          <div className="period-picker">
            <label htmlFor="public-month">VIEWING MONTH</label>
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
            type="button"
            className="summary-item summary-action"
            aria-label="Show all plots"
            aria-pressed={
              filter === "ALL" &&
              electricityFilter === "ALL" &&
              !attentionOnly &&
              !query
            }
            onClick={() => {
              setFilter("ALL");
              setElectricityFilter("ALL");
              setAttentionOnly(false);
              setQuery("");
            }}
            disabled={!ready}
          >
            <span className="metric-icon neutral">
              <Icon name="building" />
            </span>
            <div>
              <span>Total plots</span>
              <strong>
                {ready ? data.totalPlots.toString().padStart(2, "0") : "—"}
              </strong>
            </div>
          </button>
          <button
            type="button"
            className="summary-item summary-action"
            aria-label="Show paid rent"
            aria-pressed={filter === "PAID"}
            onClick={() => setFilter(filter === "PAID" ? "ALL" : "PAID")}
            disabled={!ready}
          >
            <span className="metric-icon green">
              <Icon name="check" />
            </span>
            <div>
              <span>Paid this month</span>
              <strong>
                {ready ? data.paidCount.toString().padStart(2, "0") : "—"}
                {ready && (
                  <small className="paid-percentage">{percentage}%</small>
                )}
              </strong>
            </div>
          </button>
          <button
            type="button"
            className="summary-item summary-action"
            aria-label="Show pending rent"
            aria-pressed={filter === "PENDING"}
            onClick={() => setFilter(filter === "PENDING" ? "ALL" : "PENDING")}
            disabled={!ready}
          >
            <span className="metric-icon amber">
              <Icon name="clock" />
            </span>
            <div>
              <span>Not marked paid</span>
              <strong>
                {ready
                  ? (eligiblePlots - data.paidCount).toString().padStart(2, "0")
                  : "—"}
              </strong>
            </div>
          </button>
          <button
            type="button"
            className="summary-item summary-action"
            aria-label="Show paid electricity"
            aria-pressed={electricityFilter === "PAID"}
            onClick={() =>
              setElectricityFilter(
                electricityFilter === "PAID" ? "ALL" : "PAID",
              )
            }
            disabled={!ready}
          >
            <span className="metric-icon green">
              <Icon name="check" />
            </span>
            <div>
              <span>Electricity paid</span>
              <strong>
                {ready ? `${electricityPaid}/${electricityEligible}` : "—"}
              </strong>
            </div>
          </button>
        </section>
        <section
          id="resident-list"
          className="directory"
          aria-labelledby="directory-title"
          aria-busy={loading || refreshing}
        >
          <div className="directory-heading">
            <div>
              <h2 id="directory-title">
                Resident directory
                <span className="plot-count">
                  {ready ? data.totalPlots : "—"} plots
                </span>
              </h2>
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
          <div className="directory-toolbar">
            <div
              className="status-filters"
              role="group"
              aria-label="Filter by payment status"
            >
              {(
                [
                  ["ALL", "All plots"],
                  ["PAID", "Paid"],
                  ["UNPAID", "Unpaid"],
                  ["DUE", "Due"],
                  ["PARTIAL", "Partial"],
                  ["NA", "N/A"],
                ] as const
              ).map(([value, label]) => (
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
            <div className="secondary-filters">
              <label>
                Electricity{" "}
                <select
                  aria-label="Filter electricity status"
                  value={electricityFilter}
                  onChange={(event) =>
                    setElectricityFilter(
                      event.target.value as typeof electricityFilter,
                    )
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
                  <option value="NA">
                    N/A ({ready ? electricityCounts.NA : "—"})
                  </option>
                </select>
              </label>
              <label className="attention-toggle">
                <input
                  type="checkbox"
                  checked={attentionOnly}
                  onChange={(event) => setAttentionOnly(event.target.checked)}
                />
                <span className="attention-copy">
                  <span>
                    Needs attention <b>{ready ? attentionCount : "—"}</b>
                  </span>
                  <span
                    className="attention-breakdown"
                    title="A plot can need attention for both rent and electricity."
                  >
                    Rent <strong>{ready ? rentAttentionCount : "—"}</strong> ·
                    Electricity{" "}
                    <strong>{ready ? electricityCounts.UNPAID : "—"}</strong>
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
                  ? data
                    ? "You’re offline. Showing the last loaded status."
                    : "You’re offline. Reconnect to load rent status."
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
              {Array.from({ length: 5 }, (_, index) => (
                <div className="skeleton-row" key={index}>
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
                <button
                  className="text-button"
                  onClick={() => {
                    setQuery("");
                    setFilter("ALL");
                    setElectricityFilter("ALL");
                    setAttentionOnly(false);
                  }}
                >
                  Clear filters <Icon name="arrow" />
                </button>
              )}
            </div>
          ) : (
            ready && (
              <div className="resident-table-wrap">
                <table className="resident-table">
                  <thead>
                    <tr>
                      <th scope="col">PLOT</th>
                      <th scope="col">RESIDENT</th>
                      <th scope="col">MOVE-IN DATE</th>
                      <th scope="col">PAYMENTS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plots.map((plot, index) => (
                      <tr key={plot.plotNumber}>
                        <th scope="row">
                          <span className="plot-number">
                            <Icon name="home" />
                            {plot.plotNumber}
                          </span>
                        </th>
                        <td>
                          <div className="resident-name">
                            <span
                              className={`resident-avatar avatar-${index % 4}`}
                              aria-hidden="true"
                            >
                              {plot.tenantName ? (
                                plot.tenantName
                                  .trim()
                                  .split(/\s+/)
                                  .slice(0, 2)
                                  .map((word) => word[0])
                                  .join("")
                              ) : (
                                <Icon name="home" />
                              )}
                            </span>
                            <span>
                              {plot.tenantName ?? "Not displayed"}
                              <span className="mobile-date">
                                {plot.moveInDate
                                  ? `Joined ${formatDate(plot.moveInDate)}`
                                  : "Move-in date unavailable"}
                              </span>
                              <button
                                className="plot-details-link"
                                aria-label={`View details for plot ${plot.plotNumber}`}
                                onClick={() => setHistoryPlot(plot)}
                              >
                                View details <Icon name="arrow" />
                              </button>
                            </span>
                          </div>
                        </td>
                        <td className="move-in-date">
                          {formatDate(plot.moveInDate)}
                        </td>
                        <td>
                          <div className="plot-payment-status">
                            <span>
                              <small>Rent</small>
                              <StatusBadge status={plot.status} />
                              {plot.status === "PAID" && plot.paidDate && (
                                <small className="payment-detail">
                                  {formatDate(plot.paidDate)}
                                </small>
                              )}
                            </span>
                            <span>
                              <small>
                                Electricity
                                {plot.electricityStatus !== "NA" &&
                                Number.isFinite(plot.electricityAmount)
                                  ? ` · ₹${plot.electricityAmount.toLocaleString("en-IN")}`
                                  : ""}
                              </small>
                              {plot.electricityMonths?.length > 0 ? (
                                <button
                                  className="payment-history-button"
                                  onClick={() => setHistoryPlot(plot)}
                                  aria-label={`Electricity history for plot ${plot.plotNumber}`}
                                >
                                  <StatusBadge
                                    status={plot.electricityStatus ?? "NA"}
                                  />
                                  <Icon name="arrow" />
                                </button>
                              ) : (
                                <StatusBadge
                                  status={plot.electricityStatus ?? "NA"}
                                />
                              )}
                              {plot.electricityStatus !== "NA" &&
                                plot.electricityBalance > 0 && (
                                  <small className="payment-detail">
                                    ₹
                                    {plot.electricityBalance.toLocaleString(
                                      "en-IN",
                                    )}{" "}
                                    due
                                  </small>
                                )}
                            </span>
                          </div>
                          {plot.electricityTotals?.due > 0 && (
                            <span className="plot-total-due">{`₹${plot.electricityTotals.due.toLocaleString("en-IN", { maximumFractionDigits: 2 })} total electricity due`}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          <div className="directory-footer">
            <span role="status">
              {ready
                ? `Showing ${plots.length} of ${data.totalPlots} plots`
                : "Payment status is updated by your building admin"}
            </span>
            <span>
              {ready && updatedAt
                ? `Updated ${updatedAt} · ${online ? "Auto refresh" : "Offline"}`
                : formatMonthLabel(month)}
            </span>
          </div>
        </section>
        <aside className="privacy-note">
          <span className="privacy-icon">
            <Icon name="shield" />
          </span>
          <div>
            <strong>A little transparency. A lot of privacy.</strong>
            <p>
              Tenant names follow your building’s privacy settings. Rent
              amounts, contact details, and admin notes stay private.
            </p>
          </div>
          <span className="privacy-label">
            <Icon name="lock" /> PRIVATE BY DESIGN
          </span>
        </aside>
      </main>
      {historyPlot && (
        <ElectricityHistory
          selectedMonth={month}
          plot={
            data?.plots.find(
              (plot) => plot.plotNumber === historyPlot.plotNumber,
            ) ?? historyPlot
          }
          onClose={() => setHistoryPlot(null)}
        />
      )}
      <footer className="public-container site-footer">
        <span>
          <span className="footer-monogram">SJR</span> A place to call home.
        </span>
        <span>
          Questions about your status? <span>Contact your building admin.</span>
        </span>
      </footer>
    </div>
  );
}
