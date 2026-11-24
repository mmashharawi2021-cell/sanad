import { deleteExtension, installDraft, listExtensions, proposeExtension, restorePreviousVersion, setExtensionEnabled } from "../selfDev";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";
import { selfDevGenerator } from "./chat";

/** مطوّر سند الذاتي والإضافات. */
export const extensionRoutes: Route[] = [
  {
    method: "GET", path: "/api/extensions", handler: async ({ res }) => {
      sendJson(res, 200, { success: true, extensions: await listExtensions() });
    },
  },
  {
    method: "POST", path: "/api/selfdev/propose", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : undefined;
      const reviseId = typeof body.reviseId === "string" && body.reviseId ? body.reviseId : undefined;
      const result = await proposeExtension(String(body.request || ""), selfDevGenerator(model), reviseId);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/extensions/restore", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      sendJson(res, 200, await restorePreviousVersion(String(body.id || "")));
    },
  },
  {
    method: "POST", path: "/api/extensions/install", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      sendJson(res, 200, await installDraft(String(body.draftId || "")));
    },
  },
  {
    method: "POST", path: "/api/extensions/toggle", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      sendJson(res, 200, await setExtensionEnabled(String(body.id || ""), body.enabled === true));
    },
  },
  {
    method: "DELETE", path: "/api/extensions", handler: async ({ req, res, url }) => {
      const body = await readJsonBody(req);
      sendJson(res, 200, await deleteExtension(String(body.id || url.searchParams.get("id") || "")));
    },
  },
];
