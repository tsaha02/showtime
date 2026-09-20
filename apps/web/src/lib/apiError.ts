import type { FetchBaseQueryError } from "@reduxjs/toolkit/query";
import type { SerializedError } from "@reduxjs/toolkit";

// RTK Query error shapes are a union of FetchBaseQueryError | SerializedError;
// this pulls out the `message` field our API always sends in its
// `{error, message, details?}` error body, with a generic fallback.
export function getErrorMessage(err: FetchBaseQueryError | SerializedError | undefined): string {
  if (!err) return "Something went wrong";
  if ("status" in err) {
    const data = err.data as { message?: string } | undefined;
    if (data?.message) return data.message;
    return `Request failed (${String(err.status)})`;
  }
  return err.message ?? "Something went wrong";
}
