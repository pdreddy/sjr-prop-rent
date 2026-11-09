"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Icon } from "@/components/public/Icon";
import {
  calculateElectricity,
  DEFAULT_ELECTRICITY_INPUT,
  RECEIPT_EXAMPLE,
  electricityInputSchema,
  taxComponents,
  type ElectricityInput,
  type ElectricityRecord,
} from "@/lib/buildingElectricity";
import { formatMonthLabel, getCurrentMonth } from "@/lib/month";

const inr = (amount: number) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(
    amount,
  );
const labels = {
  fixed: "Fixed charges",
  energy: "Energy charges",
  fppca: "FPPCA",
  surcharge: "Surcharge",
};
type NumericKey = {
  [K in keyof ElectricityInput]: ElectricityInput[K] extends number ? K : never;
}[keyof ElectricityInput];

export default function ElectricityBill() {
  const [month, setMonth] = useState(getCurrentMonth());
  const [input, setInput] = useState<ElectricityInput>(
    DEFAULT_ELECTRICITY_INPUT,
  );
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reload, setReload] = useState(0);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const valid = electricityInputSchema.safeParse(input);
  const bill = valid.success ? calculateElectricity(valid.data) : null;

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setLoadError(false);
      setMessage("");
      try {
        const response = await fetch(
          `/api/admin/building-electricity?month=${month}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (!response.ok)
          throw new Error("Could not load electricity bill. Please retry.");
        const { record }: { record: ElectricityRecord | null } =
          await response.json();
        if (controller.signal.aborted) return;
        setInput(record?.input ?? { ...DEFAULT_ELECTRICITY_INPUT });
        setSavedAt(record?.updatedAt ?? null);
        setDirty(false);
      } catch {
        if (!controller.signal.aborted) {
          setLoadError(true);
          setMessage("Could not load this month’s bill. Retry before editing.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [month, reload]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  function change<K extends keyof ElectricityInput>(
    key: K,
    value: ElectricityInput[K],
  ) {
    setInput((current) => ({ ...current, [key]: value }));
    setDirty(true);
    setMessage("");
  }
  function numberField(
    key: NumericKey,
    label: string,
    step = "0.01",
    hint?: string,
  ) {
    return (
      <label className="bill-field" key={key}>
        <span>{label}</span>
        <input
          type="number"
          required
          min="0"
          step={step}
          value={Number.isNaN(input[key]) ? "" : input[key]}
          onChange={(event) =>
            change(
              key,
              event.target.value === "" ? NaN : Number(event.target.value),
            )
          }
        />
        {hint && <small>{hint}</small>}
      </label>
    );
  }
  function changeMonth(next: string) {
    if (
      !next ||
      (dirty && !window.confirm("Discard unsaved changes for this month?"))
    )
      return;
    setMonth(next);
  }
  async function save() {
    if (!valid.success || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/building-electricity", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ month, input: valid.data }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error ?? "Save failed.");
      setSavedAt(json.record.updatedAt);
      setDirty(false);
      setMessage("Electricity bill and collection note saved.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not save. Please retry.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="public-site electricity-page">
      <header className="site-header">
        <div className="public-container header-inner">
          <Link href="/admin" className="brand">
            <span className="brand-mark">
              <Icon name="building" />
            </span>
            <span>
              <strong>SJR Building</strong>
              <span>ADMIN WORKSPACE</span>
            </span>
          </Link>
          <Link className="admin-link" href="/admin">
            Back to dashboard <Icon name="arrow" />
          </Link>
        </div>
      </header>
      <main className="public-container public-main">
        <div className="page-intro">
          <div>
            <p className="eyebrow">BUILDING UTILITIES · ADMIN ONLY</p>
            <h1>
              Electricity, <em>accounted for.</em>
            </h1>
            <p className="intro-copy">
              The original building bill and tenant collections, side by side.
            </p>
          </div>
          <label className="bill-field">
            <span>Billing month</span>
            <input
              type="month"
              required
              value={month}
              onChange={(event) => changeMonth(event.target.value)}
              disabled={saving}
            />
          </label>
        </div>
        {loading ? (
          <p role="status" className="bill-notice">
            Loading {formatMonthLabel(month)}…
          </p>
        ) : loadError ? (
          <div className="bill-notice" role="alert">
            <p>{message}</p>
            <button
              className="text-button"
              onClick={() => setReload((value) => value + 1)}
            >
              Retry loading <Icon name="refresh" />
            </button>
          </div>
        ) : (
          <>
            <div className="bill-notice">
              <Icon name="shield" />
              <p>
                Each month keeps its own rates and readings. Tenant collections
                are a separate note; saving here does not change rent records or
                public payment status.
              </p>
            </div>
            <form
              className="electricity-layout"
              onSubmit={(event) => {
                event.preventDefault();
                void save();
              }}
            >
              <fieldset className="bill-editor" disabled={saving}>
                <section className="bill-section">
                  <div className="bill-section-heading">
                    <div>
                      <p className="eyebrow">01 / THE METER</p>
                      <h2>Readings & billing load</h2>
                    </div>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => {
                        if (
                          dirty &&
                          !window.confirm(
                            "Replace unsaved inputs with the receipt example?",
                          )
                        )
                          return;
                        setInput({ ...RECEIPT_EXAMPLE });
                        setDirty(true);
                        setMessage(
                          "Receipt example loaded for comparison. Not saved yet.",
                        );
                      }}
                    >
                      Load receipt example
                    </button>
                  </div>
                  <div className="bill-fields">
                    {numberField("previousReading", "Previous reading", "any")}
                    {numberField("currentReading", "Current reading", "any")}
                    {numberField("meterConstant", "Meter constant", "any")}
                    {numberField(
                      "billedLoadKw",
                      "Billed load (kW)",
                      "any",
                      "Fixed charges use billed load, not recorded demand.",
                    )}
                    {numberField(
                      "recordedDemandKw",
                      "Recorded demand (kW)",
                      "any",
                      "Reference only; enter any excess-demand penalty below.",
                    )}
                    {numberField(
                      "powerFactor",
                      "Power factor",
                      "any",
                      "Reference only; enter any PF penalty below.",
                    )}
                  </div>
                </section>
                <section className="bill-section">
                  <div className="bill-section-heading">
                    <div>
                      <p className="eyebrow">02 / THE TARIFF</p>
                      <h2>Rates & tax</h2>
                    </div>
                  </div>
                  <div className="bill-fields">
                    {numberField("fixedRate", "Fixed rate (₹/kW)", "any")}
                    {numberField("energyRate", "Energy rate (₹/unit)", "any")}
                    {numberField("fppcaRate", "FPPCA rate (₹/unit)", "any")}
                    {numberField("surchargeRate", "Surcharge (₹/unit)", "any")}
                    {numberField("taxPercent", "Tax (%)", "any")}
                    <label className="bill-field">
                      <span>Final rounding</span>
                      <select
                        value={input.rounding}
                        onChange={(event) =>
                          change(
                            "rounding",
                            event.target.value as ElectricityInput["rounding"],
                          )
                        }
                      >
                        <option value="NEAREST_RUPEE">Nearest rupee</option>
                        <option value="NONE">Keep paise</option>
                        <option value="UP_RUPEE">Round up to rupee</option>
                        <option value="DOWN_RUPEE">Round down to rupee</option>
                      </select>
                    </label>
                  </div>
                  <fieldset className="tax-basis">
                    <legend>Apply tax to</legend>
                    {taxComponents.map((key) => (
                      <label key={key}>
                        <input
                          type="checkbox"
                          checked={input.taxableComponents.includes(key)}
                          onChange={(event) =>
                            change(
                              "taxableComponents",
                              event.target.checked
                                ? [...input.taxableComponents, key]
                                : input.taxableComponents.filter(
                                    (item) => item !== key,
                                  ),
                            )
                          }
                        />
                        {labels[key]}
                      </label>
                    ))}
                    <p>
                      The supplied receipt taxes only the energy charge at 9%.
                    </p>
                  </fieldset>
                </section>
                <section className="bill-section">
                  <div className="bill-section-heading">
                    <div>
                      <p className="eyebrow">03 / ADJUSTMENTS</p>
                      <h2>Additional charges</h2>
                    </div>
                  </div>
                  <div className="bill-fields">
                    {numberField("pfPenalty", "PF penalty (₹)")}
                    {numberField(
                      "excessDemandPenalty",
                      "Excess-load / MD penalty (₹)",
                    )}
                    {numberField("interest", "Interest (₹)")}
                    {numberField("arrears", "Arrears (₹)")}
                    {numberField("credits", "Credits / deductions (₹)")}
                  </div>
                </section>
                <section className="bill-section">
                  <div className="bill-section-heading">
                    <div>
                      <p className="eyebrow">04 / THE ORIGINAL & COLLECTIONS</p>
                      <h2>Keep the complete picture</h2>
                    </div>
                  </div>
                  <div className="bill-fields">
                    <label className="bill-field">
                      <span>Original building bill total (₹)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={input.originalBillAmount ?? ""}
                        placeholder="Enter the amount on the original bill"
                        onChange={(event) =>
                          change(
                            "originalBillAmount",
                            event.target.value === ""
                              ? null
                              : Number(event.target.value),
                          )
                        }
                      />
                      <small>
                        Optional. Used to compare against the calculation.
                      </small>
                    </label>
                    {numberField(
                      "tenantCollected",
                      "Total collected from all tenants (₹)",
                    )}
                    <label className="bill-field">
                      <span>Bill number / reference</span>
                      <input
                        value={input.billReference}
                        maxLength={200}
                        onChange={(event) =>
                          change("billReference", event.target.value)
                        }
                        placeholder="Original utility bill reference"
                      />
                    </label>
                    <label className="bill-field">
                      <span>Original bill link (optional)</span>
                      <input
                        type="url"
                        value={input.originalBillUrl}
                        onChange={(event) =>
                          change("originalBillUrl", event.target.value)
                        }
                        placeholder="https://…"
                      />
                      <small>
                        Link to your stored receipt; no file upload is required.
                      </small>
                    </label>
                    <label className="bill-field bill-field-wide">
                      <span>Collection / reconciliation note</span>
                      <textarea
                        value={input.notes}
                        maxLength={2000}
                        onChange={(event) =>
                          change("notes", event.target.value)
                        }
                        placeholder="Tenant collection details, dates, or discrepancies…"
                        rows={3}
                      />
                    </label>
                  </div>
                </section>
              </fieldset>
              <aside className="bill-sidebar">
                <section className="bill-breakdown">
                  <p className="eyebrow">
                    {formatMonthLabel(month).toUpperCase()}
                  </p>
                  <h2>The bill, line by line.</h2>
                  {bill ? (
                    <>
                      <div className="bill-units">
                        <span>Consumed units</span>
                        <strong>{bill.units.toLocaleString("en-IN")}</strong>
                        <small>
                          ({input.currentReading} − {input.previousReading}) ×{" "}
                          {input.meterConstant}
                        </small>
                      </div>
                      <dl>
                        {taxComponents.map((key) => (
                          <div key={key}>
                            <dt>
                              {labels[key]}
                              <small>
                                {key === "fixed"
                                  ? `${input.billedLoadKw} kW × ₹${input.fixedRate}`
                                  : `${bill.units} units × ₹${input[`${key}Rate` as "energyRate" | "fppcaRate" | "surchargeRate"]}`}
                              </small>
                            </dt>
                            <dd>{inr(bill[key])}</dd>
                          </div>
                        ))}
                        <div>
                          <dt>
                            Tax ({input.taxPercent}%)
                            <small>On {inr(bill.taxable)}</small>
                          </dt>
                          <dd>{inr(bill.tax)}</dd>
                        </div>
                        {(
                          [
                            ["PF penalty", input.pfPenalty],
                            [
                              "Excess-demand penalty",
                              input.excessDemandPenalty,
                            ],
                            ["Interest", input.interest],
                            ["Current demand", bill.currentDemand],
                            ["Arrears", input.arrears],
                            ["Credits", -input.credits],
                            ["Rounding", bill.roundingAdjustment],
                          ] as const
                        ).map(([label, amount]) => (
                          <div
                            key={label}
                            className={
                              label === "Current demand" ? "bill-subtotal" : ""
                            }
                          >
                            <dt>{label}</dt>
                            <dd>{inr(amount)}</dd>
                          </div>
                        ))}
                      </dl>
                      <div className="bill-total">
                        <span>Calculated net payable</span>
                        <strong>{inr(bill.netPayable)}</strong>
                      </div>
                    </>
                  ) : (
                    <p className="bill-validation" role="alert">
                      {valid.error?.issues[0]?.message ??
                        "Check your bill inputs."}
                    </p>
                  )}
                </section>
                <section className="bill-reconciliation">
                  <p className="eyebrow">SIDE NOTE / TENANT COLLECTIONS</p>
                  <h2>Bill vs. collected</h2>
                  <dl>
                    <div>
                      <dt>Original building bill</dt>
                      <dd>
                        {input.originalBillAmount === null
                          ? "Not entered"
                          : inr(input.originalBillAmount)}
                      </dd>
                    </div>
                    <div>
                      <dt>Collected from tenants</dt>
                      <dd>{inr(input.tenantCollected || 0)}</dd>
                    </div>
                  </dl>
                  {bill && (
                    <>
                      <div className="collection-balance">
                        <span>
                          {bill.collectionBalance < 0
                            ? "Collected above bill"
                            : "Still to cover"}
                        </span>
                        <strong>{inr(Math.abs(bill.collectionBalance))}</strong>
                        <small>
                          Compared with{" "}
                          {input.originalBillAmount === null
                            ? "calculated net payable"
                            : "the original bill"}
                          .
                        </small>
                      </div>
                      {bill.originalDifference !== null && (
                        <p className="bill-difference">
                          Original minus calculated:{" "}
                          <strong>{inr(bill.originalDifference)}</strong>
                        </p>
                      )}
                    </>
                  )}
                  {input.originalBillUrl &&
                    /^https:\/\//.test(input.originalBillUrl) && (
                      <a
                        className="text-button"
                        href={input.originalBillUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        View original bill <Icon name="arrow" />
                      </a>
                    )}
                </section>
                <button
                  type="submit"
                  className="solid-button bill-save"
                  disabled={!valid.success || saving || !dirty}
                >
                  {saving ? "Saving…" : "Save monthly bill"}
                </button>
                <p className="bill-save-note">
                  {dirty
                    ? "Unsaved changes"
                    : savedAt
                      ? `Saved ${new Date(savedAt).toLocaleString()}`
                      : "No bill saved for this month yet."}
                </p>
                {message && (
                  <p className="bill-message" role="status">
                    {message}
                  </p>
                )}
              </aside>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
