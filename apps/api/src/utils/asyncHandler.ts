import type { NextFunction, Request, Response } from "express";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<unknown>;

// Express doesn't forward rejected promises to error middleware on its
// own (pre-Express-5); wrap every async route handler so a thrown/rejected
// error reaches errorHandler.ts instead of hanging the request.
export function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}
