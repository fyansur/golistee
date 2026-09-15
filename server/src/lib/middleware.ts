import { Request, Response, NextFunction } from "express";
import { verifyToken } from "./jwt.js";

export const auth = (req: Request, res: Response, next: NextFunction) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    const payload = verifyToken(token);
    (req as any).userId = payload.userId;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
};