"use client";

import { useEffect, useRef } from "react";
import type { PublicPlot } from "@/lib/types";
import { formatMonthLabel } from "@/lib/month";
import { rupee } from "@/lib/format";
import StatusBadge from "@/components/StatusBadge";

export default function ElectricityHistory({
  plot,
  onClose,
}: {
  plot: PublicPlot;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="electricity-history-dialog"
      aria-labelledby="electricity-history-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
    >
      <div className="history-dialog-inner">
        <div className="history-dialog-heading">
          <div>
            <p className="eyebrow">PLOT {plot.plotNumber}</p>
            <h2 id="electricity-history-title">Electricity history</h2>
          </div>
          <button
            autoFocus
            onClick={() => dialog.current?.close()}
            aria-label="Close electricity history"
          >
            ×
          </button>
        </div>
        <p className="history-dialog-note">
          Recorded meter bills and credits, month by month.
        </p>
        <div className="history-table-scroll">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Units</th>
                <th>Billed</th>
                <th>Covered</th>
                <th>Due</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {plot.electricityMonths.map((entry) => (
                <tr key={entry.month}>
                  <th scope="row">{formatMonthLabel(entry.month)}</th>
                  <td>{entry.isDefault ? "Flat rate" : entry.units}</td>
                  <td>{rupee(entry.bill)}</td>
                  <td>{rupee(entry.paid)}</td>
                  <td>{rupee(entry.balance)}</td>
                  <td>
                    <StatusBadge status={entry.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}
