import { randomUUID } from "node:crypto";
import type { Request, Response, NextFunction } from "express";
export interface ErrorTracker {
  capture(event: {
    requestId: string;
    errorType: string;
    environment: string;
    release: string;
  }): void;
}
export const safeErrorTracker: ErrorTracker = {
  capture(event) {
    if (process.env.NODE_ENV !== "test")
      console.error(
        JSON.stringify({
          level: "error",
          event: "request_exception",
          ...event,
        }),
      );
  },
};
export const httpMetrics = { requests: 0, errors: 0, totalDurationMs: 0 };
export function requestTelemetry(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = randomUUID();
  const start = performance.now();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-ID", requestId);
  res.once("finish", () => {
    const durationMs = performance.now() - start;
    httpMetrics.requests++;
    httpMetrics.totalDurationMs += durationMs;
    if (res.statusCode >= 500) httpMetrics.errors++;
    if (process.env.NODE_ENV === "test") return;
    const auth = (
      req as Request & { auth?: { tenantId: string; userId: string } }
    ).auth;
    // Only route templates and allowlisted identifiers; never raw URL/query/body/headers.
    console.info(
      JSON.stringify({
        level: "info",
        event: "http_request",
        requestId,
        method: req.method,
        route:
          typeof req.route?.path === "string" ? req.route.path : "unmatched",
        status: res.statusCode,
        durationMs: Math.round(durationMs * 100) / 100,
        tenantId: auth?.tenantId,
        userId: auth?.userId,
        environment: process.env.APP_ENV ?? process.env.NODE_ENV,
        release: process.env.RELEASE_SHA ?? "development",
      }),
    );
  });
  next();
}
