import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { prisma } from "./lib/prisma.js";
import { PrintifyError } from "./lib/printify.js";
import authRouter from "./routes/auth.js";
import connectionsRouter from "./routes/connections.js";
import blueprintsRouter from "./routes/blueprints.js";
import listingsRouter from "./routes/listings.js";
import templatesRouter from "./routes/templates.js";
import publishRouter, { publishJobHandlers } from "./routes/publish.js";
import designsRouter from "./routes/designs.js";
import { startJobWorker, stopJobWorker } from "./lib/backgroundJobs.js";
import ordersRouter, { orderJobHandlers } from "./routes/orders.js";
import { accountJobHandlers } from "./lib/accountDeletion.js";

// Default to the safe (non-verbose) posture unless a deploy explicitly opts
// into development mode — this used to default the other way, which meant
// an unhandled error's stack trace went straight into the API response.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
const isDev = process.env.NODE_ENV === "development";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../../client/dist");

const app = express();
const PORT = process.env.PORT ?? 3000;

// Production traffic reaches Express through the single Nginx hop in nginx.conf.
// This keeps IP-based rate limiting keyed to the client instead of the proxy.
app.set("trust proxy", 1);
app.use(express.json({
  verify: (req, _res, buffer) => {
    if ((req as express.Request).originalUrl === "/api/orders/webhook") (req as any).rawBody = Buffer.from(buffer);
  },
}));
app.use("/api/auth", authRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/blueprints", blueprintsRouter);
app.use("/api/listings", listingsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/publish", publishRouter);
app.use("/api/designs", designsRouter);
app.use("/api/orders", ordersRouter);

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok" });
  } catch {
    res.status(503).json({ status: "error", error: "Database unreachable" });
  }
});

// Same-origin production serving — the client build's own API calls hit
// /api/* on this same server, so there's nothing to reverse-proxy or CORS.
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.method !== "GET") return next();
  res.sendFile(path.join(clientDist, "index.html"), (err) => {
    if (err) next();
  });
});

// Single place every route's thrown/rejected errors land (Express 5 forwards
// async rejections here automatically) — so a bug in any handler returns a
// clean JSON error instead of either hanging or leaking a stack trace.
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof PrintifyError) {
    return res.status(err.status).json({ error: err.message });
  }
  if (err instanceof multer.MulterError) {
    const message = err.code === "LIMIT_FILE_SIZE" ? "File is too large" : err.message;
    return res.status(400).json({ error: message });
  }
  if (err?.message === "Unsupported file type") {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: "Something went wrong", ...(isDev ? { stack: err?.stack } : {}) });
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV})`);
});
startJobWorker({ ...publishJobHandlers, ...orderJobHandlers, ...accountJobHandlers });

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  await stopJobWorker();
  await closed;
  await prisma.$disconnect();
  process.exit(0);
}

process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("SIGINT", () => void shutdown("SIGINT"));
