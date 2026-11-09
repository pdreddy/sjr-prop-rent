import "server-only";
import { NextResponse } from "next/server";

/**
 * Wraps a Route Handler so an unexpected exception (missing env var, database connection failure, ...)
 * always returns a JSON error instead of an HTML/empty 500 the client cannot parse. The real error is
 * logged server-side; in development it is also included in the response to speed up debugging.
 */
export function withErrorHandling<Args extends unknown[], R extends Response>(handler: (...args: Args) => Promise<R>) {
  return async (...args: Args): Promise<R | NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("Unhandled API error:", err);
      const detail = process.env.NODE_ENV !== "production" && err instanceof Error ? `: ${err.message}` : "";
      return NextResponse.json({ error: `Server error${detail || ". Check the server logs for details."}` }, { status: 500 });
    }
  };
}
