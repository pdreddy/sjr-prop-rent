"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/public/Icon";
import StatusBadge from "@/components/StatusBadge";
import ElectricityHistory from "@/components/public/ElectricityHistory";
import InstallApp from "@/components/public/InstallApp";
import {
  getCurrentMonth,
  getMonthOptions,
  formatDate,
  formatMonthLabel,
} from "@/lib/month";
import type { PublicPlot, PublicStatusResponse } from "@/lib/types";

type Filter = "ALL" | PublicPlot["status"];
const monthOptions = getMonthOptions();

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [result, setResult] = useState<{
    month: string;
    data: PublicStatusResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [historyPlot, setHistoryPlot] = useState<PublicPlot | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    const timeout = setTimeout(() => controller.abort(), 15_000);
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const response = await fetch(
          `/api/public/status?month=${encodeURIComponent(month)}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok) throw new Error("Unable to load status");
        const data: PublicStatusResponse = await response.json();
        if (controller.signal.aborted) return;
        setResult({ month, data });
        setUpdatedAt(
          new Date().toLocaleTimeString([], {
            hour: "numeric",
            minute: "2-digit",
          }),
        );
      } catch {
        if (active) setError(true);
      } finally {
        clearTimeout(timeout);
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [month, refresh]);

  const data = result?.month === month ? result.data : null;
  const ready = !loading && !error && data !== null;
  const eligiblePlots =
    data?.plots.filter((plot) => plot.status !== "NA").length ?? 0;
  const percentage =
    eligiblePlots && data
      ? Math.round((data.paidCount / eligiblePlots) * 100)
      : 0;
  const plots =
    data?.plots.filter(
      (plot) =>
        (filter === "ALL" || plot.status === filter) &&
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
          <InstallApp />
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
          <div className="summary-item">
            <span className="metric-icon neutral">
              <Icon name="building" />
            </span>
            <div>
              <span>Total plots</span>
              <strong>
                {ready ? data.totalPlots.toString().padStart(2, "0") : "—"}
              </strong>
            </div>
          </div>
          <div className="summary-item">
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
          </div>
          <div className="summary-item">
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
          </div>
        </section>
        <section
          id="resident-list"
          className="directory"
          aria-labelledby="directory-title"
          aria-busy={loading}
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
              className="refresh-button"
              onClick={() => setRefresh((value) => value + 1)}
              disabled={loading}
            >
              <Icon name="refresh" />
              <span>Refresh</span>
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
                  onClick={() => setFilter(value)}
                  className={filter === value ? "selected" : ""}
                >
                  {value !== "ALL" && (
                    <span className={`filter-dot ${value.toLowerCase()}`} />
                  )}
                  {label}
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
          </div>
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
          ) : error ? (
            <div className="directory-empty" role="alert">
              <span className="empty-icon">
                <Icon name="cloud" />
              </span>
              <h3>We couldn’t load the latest status.</h3>
              <p>Check your connection, then give it another try.</p>
              <button
                className="solid-button"
                onClick={() => setRefresh((value) => value + 1)}
              >
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
                            </span>
                            <span>
                              <small>Electricity</small>
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
                            </span>
                          </div>
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
                ? `Checked at ${updatedAt}`
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
          plot={historyPlot}
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
