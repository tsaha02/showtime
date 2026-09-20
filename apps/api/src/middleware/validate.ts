import type { Request, Response, NextFunction } from "express";
import type { ZodSchema } from "zod";
import { ApiError } from "../utils/ApiError";

export function validateBody(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return next(ApiError.badRequest("Validation failed", result.error.flatten()));
    }
    req.body = result.data;
    next();
  };
}

export function validateQuery(schema: ZodSchema) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      return next(ApiError.badRequest("Validation failed", result.error.flatten()));
    }
    req.query = result.data as never;
    next();
  };
}
