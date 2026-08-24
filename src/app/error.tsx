"use client";

import { useEffect } from "react";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Page crashed:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-unpaid/30 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-primary-dark">Something went wrong</h1>
        <p className="mt-2 text-sm text-foreground/70">
          Please try again. If this keeps happening, check the server logs
          for details.
        </p>
        <button
          onClick={reset}
          className="mt-4 min-h-11 w-full rounded-lg bg-primary px-4 py-2.5 text-base font-semibold text-white hover:bg-primary-dark"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
