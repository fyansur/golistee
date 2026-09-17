import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let row;
const prisma = {
  rateLimitCounter: { deleteMany: async () => ({ count: 0 }) },
  backgroundJob: {
    deleteMany: async () => ({ count: 0 }),
    updateMany: async ({ where, data }) => {
      if (where.status === "running") return { count: 0 };
      if (!row || row.id !== where.id || row.status !== where.status) return { count: 0 };
      row = {
        ...row,
        ...data,
        attempts: data.attempts?.increment ? row.attempts + data.attempts.increment : row.attempts,
      };
      return { count: 1 };
    },
    findFirst: async () => row?.status === "pending" && row.runAt <= new Date() ? row : null,
    findUnique: async ({ where }) => row?.id === where.id ? row : null,
    update: async ({ where, data }) => {
      assert.equal(where.id, row.id);
      row = { ...row, ...data };
      return row;
    },
  },
};

mock.module(new URL("../dist/lib/prisma.js", import.meta.url).href, { namedExports: { prisma } });
const { runOneJob } = await import("../dist/lib/backgroundJobs.js");

beforeEach(() => {
  row = {
    id: "job-1",
    type: "demo",
    payload: { value: 7 },
    status: "pending",
    attempts: 0,
    maxAttempts: 3,
    runAt: new Date(0),
    createdAt: new Date(0),
    lockedAt: null,
    lockedBy: null,
    lastError: null,
  };
});

test("worker atomically claims and completes a durable job", async () => {
  let handled;
  assert.equal(await runOneJob({ demo: async (payload) => { handled = payload.value; } }), true);
  assert.equal(handled, 7);
  assert.equal(row.attempts, 1);
  assert.equal(row.status, "succeeded");
  assert.equal(row.lockedAt, null);
});

test("worker schedules a failed job for retry", async () => {
  assert.equal(await runOneJob({ demo: async () => { throw new Error("temporary"); } }), true);
  assert.equal(row.status, "pending");
  assert.equal(row.attempts, 1);
  assert.match(row.lastError, /temporary/);
  assert.ok(row.runAt > new Date());
});
