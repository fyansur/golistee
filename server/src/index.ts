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
import publishRouter from "./routes/publish.js";
import designsRouter from "./routes/designs.js";

// Default to the safe (non-verbose) posture unless a deploy explicitly opts
// into development mode — this used to default the other way, which meant
// an unhandled error's stack trace went straight into the API response.
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";
const isDev = process.env.NODE_ENV === "development";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.join(__dirname, "../../client/dist");

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use("/api/auth", authRouter);
app.use("/api/connections", connectionsRouter);
app.use("/api/blueprints", blueprintsRouter);
app.use("/api/listings", listingsRouter);
app.use("/api/templates", templatesRouter);
app.use("/api/publish", publishRouter);
app.use("/api/designs", designsRouter);

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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT} (${process.env.NODE_ENV})`);
});
