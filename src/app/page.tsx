"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/public/Icon";
import InstallApp from "@/components/public/InstallApp";
import {
  getCurrentMonth,
  getMonthOptions,
  formatDate,
  formatMonthLabel,
} from "@/lib/month";
import type { PublicStatusResponse } from "@/lib/types";

type Filter = "ALL" | "PAID" | "UNPAID";
const monthOptions = getMonthOptions();

export default function Home() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [result, setResult] = useState<{
    month: string;
    data: PublicStatusResponse;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [refresh, setRefresh] = useState(0);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
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
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [month, refresh]);

  const data = result?.month === month ? result.data : null;
  const ready = !loading && !error && data !== null;
  const percentage =
    data && data.totalPlots
      ? Math.round((data.paidCount / data.totalPlots) * 100)
      : 0;
  const plots =
    data?.plots.filter(
      (plot) =>
        (filter === "ALL" || plot.status === filter) &&
        `${plot.plotNumber} ${plot.tenantName ?? "No tenant"}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
    ) ?? [];

  return (
    <div className="public-site">
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
            <p className="eyebrow">A LITTLE MORE CLARITY. EVERY MONTH.</p>
            <h1>
              Home is better, <em>together.</em>
            </h1>
            <p className="intro-copy">
              Your building’s rent status. Simple, transparent, and all in one
              place.
            </p>
          </div>
          <InstallApp />
        </div>
        <section className="overview" aria-labelledby="overview-title">
          <div className="overview-copy">
            <p className="hero-kicker">
              <span /> MONTHLY OVERVIEW
            </p>
            <h2 id="overview-title">
              Every home.
              <br />
              One clear picture.
            </h2>
            <p>
              A quick look at where things stand
              <br className="desktop-break" /> for {formatMonthLabel(month)}.
            </p>
            <div className="hero-footnote">
              <Icon name="shield" /> Rent status, without the private details.
            </div>
          </div>
          <div className="collection-visual">
            <div
              className="collection-ring"
              style={
                {
                  "--progress": `${ready ? percentage : 0}%`,
                } as React.CSSProperties
              }
            >
              <div>
                <strong>{ready ? `${percentage}%` : "—"}</strong>
                <span>marked paid</span>
              </div>
            </div>
            <p>
              {ready ? (
                <>
                  <strong>{data.paidCount}</strong> of {data.totalPlots} plots
                  paid
                </>
              ) : (
                "Your monthly snapshot"
              )}
            </p>
          </div>
          <svg
            className="hero-architecture"
            viewBox="0 0 240 280"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M18 280V107l78-32v205M96 280V20l110 46v214M206 280V145l30 14v121M111 48l78 32M111 80l78 32M111 112l78 32M111 144l78 32M111 176l78 32M111 208l78 32M111 240l78 32M39 130l37-16M39 163l37-16M39 196l37-16M39 229l37-16M134 58v222M161 69v211"
              stroke="currentColor"
              strokeWidth="1.2"
            />
          </svg>
        </section>
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
                  ? (data.totalPlots - data.paidCount)
                      .toString()
                      .padStart(2, "0")
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
              <p className="eyebrow">THE BUILDING, AT A GLANCE</p>
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
                      <th scope="col">RENT STATUS</th>
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
                              {plot.tenantName ?? "No tenant"}
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
                          <span
                            className={`public-status ${plot.status === "PAID" ? "is-paid" : "is-unpaid"}`}
                          >
                            <Icon
                              name={plot.status === "PAID" ? "check" : "clock"}
                            />
                            {plot.status === "PAID" ? "Paid" : "Unpaid"}
                          </span>
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
              Only names, move-in dates, and rent status are public. Contact
              details, amounts, and payment history stay private.
            </p>
          </div>
          <span className="privacy-label">
            <Icon name="lock" /> PRIVATE BY DESIGN
          </span>
        </aside>
      </main>
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
