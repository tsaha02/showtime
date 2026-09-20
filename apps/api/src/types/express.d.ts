import type { UserRole } from "@showtime/shared";

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: UserRole };
      sessionId: string;
    }
  }
}

export {};
