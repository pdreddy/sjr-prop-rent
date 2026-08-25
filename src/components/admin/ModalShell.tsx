"use client";

import type { ReactNode } from "react";
import { IconClose } from "@/components/icons";

interface Props {
  titleId: string;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  maxWidth?: "sm" | "md" | "lg";
}

const widths = { sm: "sm:max-w-sm", md: "sm:max-w-md", lg: "sm:max-w-lg" };

export default function ModalShell({ titleId, title, subtitle, onClose, children, maxWidth = "md" }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-foreground/50 backdrop-blur-[2px] sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={onClose}
    >
      <div
        className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${widths[maxWidth]}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-primary/10 px-5 py-4">
          <div>
            <h2 id={titleId} className="text-lg font-bold text-primary-dark">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-foreground/50">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 -mt-1 rounded-full p-2 text-foreground/40 hover:bg-foreground/5 hover:text-foreground/70"
          >
            <IconClose />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
