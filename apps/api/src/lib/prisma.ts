import { PrismaClient } from "@prisma/client";

// Single shared Prisma client for the whole process — this app runs as
// one Express instance against one Postgres database, so there's no
// need for per-request clients or connection-pool juggling.
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
});
