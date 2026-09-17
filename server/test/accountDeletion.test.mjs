import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let user, deletedUsers, deletionJobStatus;
const prisma = {
  user: {
    findUnique: async ({ where }) => (user && user.id === where.id ? user : null),
    deleteMany: async ({ where }) => {
      const matches = user && user.id === where.id
        && user.deletionScheduledAt?.toISOString() === where.deletionScheduledAt?.toISOString();
      if (!matches) return { count: 0 };
      deletedUsers.push(user.id);
      user = null;
      return { count: 1 };
    },
    updateMany: async ({ where, data }) => {
      if (!user || user.id !== where.id || user.deletionScheduledAt?.toISOString() !== where.deletionScheduledAt?.toISOString()) {
        return { count: 0 };
      }
      user = { ...user, ...data };
      return { count: 1 };
    },
  },
  shop: { findMany: async () => [] },
  backgroundJob: {
    deleteMany: async ({ where }) => {
      if (!where.status.in.includes(deletionJobStatus)) return { count: 0 };
      deletionJobStatus = null;
      return { count: 1 };
    },
  },
};
prisma.$transaction = async (operation) => operation(prisma);
mock.module(new URL("../dist/lib/prisma.js", import.meta.url).href, { namedExports: { prisma } });
mock.module(new URL("../dist/lib/crypto.js", import.meta.url).href, { namedExports: { decryptToken: (s) => s } });
mock.method(globalThis, "fetch", async () => { throw new Error("Unexpected Printify/R2 request"); });

const { accountJobHandlers, cancelAccountDeletion } = await import("../dist/lib/accountDeletion.js");

beforeEach(() => {
  deletedUsers = [];
  user = { id: "user-1", deletionScheduledAt: new Date(Date.now() - 1_000) };
  deletionJobStatus = "pending";
  delete process.env.PUBLIC_BASE_URL;
  delete process.env.R2_BUCKET;
});

test("no-ops once deletion has been canceled", async () => {
  const scheduledAt = user.deletionScheduledAt.toISOString();
  user.deletionScheduledAt = null;
  await accountJobHandlers.delete_account({ userId: "user-1", scheduledAt });
  assert.deepEqual(deletedUsers, []);
});

test("no-ops if the account was rescheduled to a different time", async () => {
  const staleAt = user.deletionScheduledAt.toISOString();
  user.deletionScheduledAt = new Date(Date.now() + 999_000_000);
  await accountJobHandlers.delete_account({ userId: "user-1", scheduledAt: staleAt });
  assert.deepEqual(deletedUsers, []);
});

test("refuses to run before its scheduled time", async () => {
  user.deletionScheduledAt = new Date(Date.now() + 999_000_000);
  const scheduledAt = user.deletionScheduledAt.toISOString();
  await assert.rejects(
    accountJobHandlers.delete_account({ userId: "user-1", scheduledAt }),
    /before its due time/,
  );
  assert.deepEqual(deletedUsers, []);
});

test("deletes the user once the grace period is due", async () => {
  const scheduledAt = user.deletionScheduledAt.toISOString();
  await accountJobHandlers.delete_account({ userId: "user-1", scheduledAt });
  assert.deepEqual(deletedUsers, ["user-1"]);
});

test("cancel removes a pending deletion job before clearing the schedule", async () => {
  assert.equal(await cancelAccountDeletion("user-1"), "canceled");
  assert.equal(deletionJobStatus, null);
  assert.equal(user.deletionScheduledAt, null);
});

test("cancel refuses once deletion is running", async () => {
  deletionJobStatus = "running";
  const scheduledAt = user.deletionScheduledAt;
  assert.equal(await cancelAccountDeletion("user-1"), "in_progress");
  assert.equal(user.deletionScheduledAt, scheduledAt);
});
