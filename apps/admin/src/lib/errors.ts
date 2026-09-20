// RTK Query error objects surface `data.message` per the API's
// { error, message, details? } error body shape.
export function extractErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "data" in err) {
    const data = (err as { data?: unknown }).data;
    if (data && typeof data === "object" && "message" in data) {
      return String((data as { message?: unknown }).message ?? "Something went wrong");
    }
  }
  return "Something went wrong";
}
