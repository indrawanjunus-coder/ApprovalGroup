import { Request, Response, NextFunction } from "express";
import { db } from "./db.js";
import { auditLogsTable } from "@workspace/db/schema";

export function errorAuditMiddleware(req: Request, res: Response, next: NextFunction) {
  const capturedUrl = req.originalUrl;
  const capturedMethod = req.method;
  const originalJson = res.json.bind(res);

  res.json = function (body: any) {
    const status = res.statusCode;
    if (status >= 400) {
      const userId = (req as any).user?.id ?? 0;
      const errorMsg = body?.error || body?.message || String(status);
      const details = JSON.stringify({
        method: capturedMethod,
        url: capturedUrl,
        status,
        error: errorMsg,
      });

      if (status >= 500) {
        console.error(`[${capturedMethod} ${capturedUrl}] HTTP ${status}: ${errorMsg}`);
      }

      db.insert(auditLogsTable).values({
        userId,
        action: "api_error",
        entityType: `${capturedMethod}:${capturedUrl}`,
        entityId: 0,
        details,
      }).catch((err) => {
        console.error("errorAuditMiddleware: failed to insert audit log:", err);
      });
    }
    return originalJson(body);
  };

  next();
}
