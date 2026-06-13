import { ErrorRequestHandler } from "express";
import { MulterError } from "multer";

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof MulterError) {
    return res.status(400).json({ error: err.message });
  }

  const status = typeof err?.status === "number" ? err.status : 500;
  const message = err instanceof Error ? err.message : "伺服器發生未知錯誤";

  if (status >= 500) {
    console.error(err);
  }

  res.status(status).json({ error: message });
};
