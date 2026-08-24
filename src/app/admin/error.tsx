"use client";

import { useEffect } from "react";

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin page crashed:", error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm rounded-xl border border-unpaid/30 bg-white p-6 text-center shadow-sm">
        <h1 className="text-lg font-bold text-primary-dark">Something went wrong</h1>
        <p className="mt-2 text-sm text-foreground/70">
          The admin dashboard hit an unexpected error, most likely a server
          configuration or database connection problem. Check the server
          logs (the terminal running the app) for the details.
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
