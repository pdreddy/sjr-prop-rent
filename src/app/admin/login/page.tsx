"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { IconArrowLeft, IconBuilding, IconLock, IconUser } from "@/components/icons";

export default function AdminLoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false
  );

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Login failed.");
        return;
      }
      router.push("/admin");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // Password-manager extensions inject attributes into login inputs before
  // React hydrates them. Render the form only after hydration so those DOM
  // mutations cannot produce a server/client mismatch.
  if (!mounted) {
    return (
      <div className="flex flex-1 items-center justify-center bg-background" aria-label="Loading sign in">
        <span className="text-sm text-foreground/60">Loading sign in…</span>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-white shadow-sm">
            <IconBuilding className="h-6 w-6" />
          </span>
          <h1 className="text-xl font-bold text-primary-dark">SJR Rent Tracker</h1>
          <p className="mt-1 text-sm text-foreground/50">Sign in to manage plots and payments</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="flex flex-col gap-4 rounded-2xl border border-primary/10 bg-white p-6 shadow-sm"
        >
          {error && (
            <div
              role="alert"
              className="rounded-lg border border-unpaid/30 bg-unpaid-bg px-3 py-2 text-sm text-unpaid"
            >
              {error}
            </div>
          )}

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Username</span>
            <div className="relative">
              <IconUser className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/45" />
              <input
                suppressHydrationWarning
                type="text"
                autoComplete="username"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-primary/20 py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-sm font-medium text-foreground/80">Password</span>
            <div className="relative">
              <IconLock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-primary/45" />
              <input
                suppressHydrationWarning
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-h-11 w-full rounded-xl border border-primary/20 py-2 pl-9 pr-3 text-base focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
            </div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="mt-2 min-h-11 rounded-xl bg-primary px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div className="mt-5 text-center">
          <Link href="/" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:underline">
            <IconArrowLeft className="h-3.5 w-3.5" />
            Back to public view
          </Link>
        </div>
      </div>
    </div>
  );
}
