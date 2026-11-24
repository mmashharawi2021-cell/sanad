import { checkPort, getNetworkInfo, killPort, listListeningPorts, pingHost } from "../networkMaestro";
import { getThroughput } from "../netMonitor";
import { readJsonBody, sendJson } from "../http/core";
import type { Route } from "../http/router";

/** الشبكة والمنافذ وسرعة الاتصال. */
export const networkRoutes: Route[] = [
  {
    // سرعة الشبكة الحية (مثل مدير المهام) — قراءة فقط
    method: "GET", path: "/api/network/throughput", handler: async ({ res }) => {
      sendJson(res, 200, getThroughput());
    },
  },
  {
    method: "GET", path: "/api/network/ports", handler: async ({ res, url }) => {
      const includeUdp = url.searchParams.get("udp") !== "0";
      const ports = await listListeningPorts({ includeUdp });
      sendJson(res, 200, { success: true, count: ports.length, ports });
    },
  },
  {
    method: "GET", path: "/api/network/port/check", handler: async ({ res, url }) => {
      const result = await checkPort(url.searchParams.get("port"));
      sendJson(res, 200, { success: true, ...result });
    },
  },
  {
    method: "POST", path: "/api/network/kill-port", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const result = await killPort(body.port);
      sendJson(res, 200, result);
    },
  },
  {
    method: "POST", path: "/api/network/ping", handler: async ({ req, res }) => {
      const body = await readJsonBody(req);
      const host = typeof body.host === "string" && body.host.trim() ? body.host : undefined;
      const count = typeof body.count === "number" ? body.count : 4;
      const result = await pingHost(host, count);
      sendJson(res, 200, result);
    },
  },
  {
    method: "GET", path: "/api/network/info", handler: async ({ res }) => {
      const info = await getNetworkInfo();
      sendJson(res, 200, { success: true, ...info });
    },
  },
];
