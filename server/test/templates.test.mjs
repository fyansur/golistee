import { test, mock } from "node:test";
import assert from "node:assert/strict";

let createdData;
const prisma = {
  template: {
    create: async ({ data }) => {
      createdData = data;
      return { id: "template-1", ...data };
    },
  },
};

mock.module(new URL("../dist/lib/prisma.js", import.meta.url).href, { namedExports: { prisma } });
mock.module(new URL("../dist/lib/middleware.js", import.meta.url).href, {
  namedExports: { auth: (_req, _res, next) => next() },
});
mock.module(new URL("../dist/lib/shopAccess.js", import.meta.url).href, {
  namedExports: { findCatalogAccount: async () => null },
});
mock.module(new URL("../dist/lib/crypto.js", import.meta.url).href, {
  namedExports: { decryptToken: (value) => value },
});
mock.module(new URL("../dist/lib/catalogOptions.js", import.meta.url).href, {
  namedExports: {
    comboKey: (blueprintId, printProviderId) => `${blueprintId}:${printProviderId}`,
    fetchCatalogOptionsByCombo: async () => new Map(),
  },
});

const { default: templatesRouter } = await import("../dist/routes/templates.js");

test("template creation belongs to the authenticated Golistee user", async () => {
  const handler = templatesRouter.stack.find(
    (layer) => layer.route?.path === "/" && layer.route.methods.post
  ).route.stack[0].handle;

  let response;
  await handler(
    {
      userId: "user-1",
      body: {
        printifyAccountId: "another-users-account",
        name: "Reusable tee",
        blueprintId: 1,
        blueprintLabel: "Tee",
        printProviderId: 2,
        printProviderLabel: "Provider",
        variants: [],
        description: "",
      },
    },
    { json: (data) => { response = data; } },
  );

  assert.equal(createdData.userId, "user-1");
  assert.equal("printifyAccountId" in createdData, false);
  assert.equal(response.userId, "user-1");
});
