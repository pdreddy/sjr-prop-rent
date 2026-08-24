import "server-only";
import { NextResponse } from "next/server";

/**
 * Wraps a Route Handler so an unexpected exception (a missing env var, a
 * database connection failure, etc.) always returns a JSON error response
 * instead of crashing into an HTML/empty response the client can't parse.
 * The real error is still logged server-side for debugging.
 */
export function withErrorHandling<Args extends unknown[]>(
  handler: (...args: Args) => Promise<NextResponse>
) {
  return async (...args: Args): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (err) {
      console.error("Unhandled API error:", err);
      return NextResponse.json(
        { error: "Server error. Check the server logs for details." },
        { status: 500 }
      );
    }
  };
}
