import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET!;

export const signToken = (userId: string) =>
  jwt.sign({ userId }, SECRET, { expiresIn: "7d" });

export const verifyToken = (token: string) =>
  jwt.verify(token, SECRET) as { userId: string };