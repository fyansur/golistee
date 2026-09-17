import { randomUUID } from "node:crypto";
import { prisma } from "./prisma.js";

export type JobHandler = (payload: any, attempt?: number, maxAttempts?: number) => Promise<void>;

const POLL_MS = 1_000;
const LEASE_MS = 15 * 60_000;
const workerId = `${process.pid}:${randomUUID()}`;

let timer: NodeJS.Timeout | undefined;
let activeTick: Promise<void> | undefined;
let stopping = false;
let lastLeaseSweep = 0;
let lastCleanup = 0;

export const newJob = (type: string, payload: unknown, userId?: string, maxAttempts = 5) => ({
  type,
  payload: payload as any,
  userId,
  maxAttempts,
});

async function claimNextJob() {
  const now = new Date();
  if (now.getTime() - lastLeaseSweep >= 60_000) {
    lastLeaseSweep = now.getTime();
    await prisma.backgroundJob.updateMany({
      where: { status: "running", lockedAt: { lt: new Date(now.getTime() - LEASE_MS) } },
      data: { status: "pending", lockedAt: null, lockedBy: null, runAt: now, lastError: "Worker lease expired" },
    });
  }
  if (now.getTime() - lastCleanup >= 60 * 60_000) {
    lastCleanup = now.getTime();
    await prisma.backgroundJob.deleteMany({
      where: { status: "succeeded", updatedAt: { lt: new Date(now.getTime() - 30 * 24 * 60 * 60_000) } },
    });
    await prisma.rateLimitCounter.deleteMany({
      where: { resetAt: { lt: new Date(now.getTime() - 24 * 60 * 60_000) } },
    });
  }

  const candidate = await prisma.backgroundJob.findFirst({
    where: { status: "pending", runAt: { lte: now } },
    orderBy: [{ runAt: "asc" }, { createdAt: "asc" }],
  });
  if (!candidate) return null;

  const claimed = await prisma.backgroundJob.updateMany({
    where: { id: candidate.id, status: "pending" },
    data: { status: "running", lockedAt: now, lockedBy: workerId, attempts: { increment: 1 } },
  });
  if (claimed.count === 0) return null;
  return prisma.backgroundJob.findUnique({ where: { id: candidate.id } });
}

async function runJob(handlers: Record<string, JobHandler>) {
  const job = await claimNextJob();
  if (!job) return false;

  try {
    const handler = handlers[job.type];
    if (!handler) throw new Error(`No handler for job type ${job.type}`);
    await handler(job.payload, job.attempts, job.maxAttempts);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: { status: "succeeded", lockedAt: null, lockedBy: null, lastError: null },
    });
  } catch (error: any) {
    const failed = job.attempts >= job.maxAttempts;
    const retryDelay = Math.min(60_000 * 2 ** Math.max(0, job.attempts - 1), 15 * 60_000);
    await prisma.backgroundJob.update({
      where: { id: job.id },
      data: {
        status: failed ? "failed" : "pending",
        runAt: failed ? job.runAt : new Date(Date.now() + retryDelay),
        lockedAt: null,
        lockedBy: null,
        lastError: String(error?.message ?? error).slice(0, 2_000),
      },
    });
  }
  return true;
}

export const runOneJob = (handlers: Record<string, JobHandler>) => runJob(handlers);

async function tick(handlers: Record<string, JobHandler>) {
  while (!stopping && await runJob(handlers)) {
    // Drain due work. Awaiting each handler bounds concurrency per replica.
  }
}

export function startJobWorker(handlers: Record<string, JobHandler>) {
  if (timer) return;
  stopping = false;
  const poll = () => {
    activeTick = tick(handlers).catch((error) => console.error("Background worker failed:", error));
    activeTick.finally(() => {
      activeTick = undefined;
      if (!stopping) timer = setTimeout(poll, POLL_MS);
    });
  };
  poll();
}

export async function stopJobWorker() {
  stopping = true;
  if (timer) clearTimeout(timer);
  timer = undefined;
  await activeTick;
}
