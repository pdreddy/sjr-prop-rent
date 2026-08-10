import { NextResponse } from "next/server";
import { firebaseEnvironmentIssues, listDocuments } from "@/lib/firebase";

export const dynamic = "force-dynamic";

export async function GET() {
  const issues = firebaseEnvironmentIssues();
  let firebaseHealthy = issues.length === 0;
  const sessionHealthy = !process.env.SESSION_SECRET || process.env.SESSION_SECRET.length >= 32;

  if (!sessionHealthy) {
    issues.push("Remove SESSION_SECRET or set it to a value containing at least 32 characters.");
  }

  if (firebaseHealthy) {
    try {
      await listDocuments("admins");
    } catch (error) {
      firebaseHealthy = false;
      console.error("Firebase health check failed:", error);
      issues.push("Firebase credentials or database connection failed. Check the Netlify function log for this request.");
    }
  }

  const healthy = issues.length === 0;
  return NextResponse.json(
    { status: healthy ? "ok" : "error", checks: { firebase: firebaseHealthy, session: sessionHealthy }, issues },
    {
      status: healthy ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
