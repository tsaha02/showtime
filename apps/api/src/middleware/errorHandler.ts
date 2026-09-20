import type { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ApiError } from "../utils/ApiError";

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: "NOT_FOUND", message: "Route not found" });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ error: err.code, message: err.message, details: err.details });
  }

  // A request carries a syntactically-valid, correctly-signed auth
  // cookie whose `userId` no longer exists in the database (e.g. the
  // account was deleted, or — the actual case this was caught from —
  // a dev/demo database was reseeded out from under a still-logged-in
  // browser session). `attachUser` in middleware/auth.ts only verifies
  // the JWT itself, not that the user it names still exists, so this
  // surfaces here as a foreign-key violation on whatever the request
  // was trying to create (a Booking, a WalletTransaction, ...) rather
  // than as an auth failure — which is what it actually is. Mapped to a
  // clean 401 so the client's existing "please log in again" handling
  // applies, instead of a confusing, unactionable 500.
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2003") {
    const field = typeof err.meta?.field_name === "string" ? err.meta.field_name : "";
    if (field.toLowerCase().includes("userid")) {
      return res.status(401).json({
        error: "UNAUTHORIZED",
        message: "Your session refers to an account that no longer exists. Please log in again.",
      });
    }
  }

  console.error(err);
  return res.status(500).json({ error: "INTERNAL_ERROR", message: "Something went wrong" });
}
