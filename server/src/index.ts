import "dotenv/config";
import express from "express";
import authRouter from "./routes/auth.js";
import connectionsRouter from "./routes/connections.js";
import blueprintsRouter from "./routes/blueprints.js";
import listingsRouter from "./routes/listings.js";
import templatesRouter from "./routes/templates.js";
import publishRouter from "./routes/publish.js";
import designsRouter from "./routes/designs.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(express.json());
app.use("/auth", authRouter);
app.use("/connections", connectionsRouter);
app.use("/blueprints", blueprintsRouter);
app.use("/listings", listingsRouter);
app.use("/templates", templatesRouter);
app.use("/publish", publishRouter);
app.use("/designs", designsRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});