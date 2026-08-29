import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import dotenv from "dotenv";
import handler from "./api/job-search/run.mjs";
import candidatesHandler from "./api/job-search/candidates.mjs";
import selectHandler from "./api/job-search/select.mjs";

dotenv.config({ path: resolve(import.meta.dirname, ".env.local"), override: true });

const root = resolve(import.meta.dirname);
const port = Number(process.env.JOB_MATCHER_PORT || 3000);
const host = process.env.JOB_MATCHER_HOST || "127.0.0.1";
const mime = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".md": "text/markdown; charset=utf-8" };

async function readBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function serveStatic(request, response) {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const target = resolve(root, relative);
  if (!target.startsWith(`${root}${sep}`) || /(^|[\\/])(?:\.env|node_modules)([\\/]|$)/i.test(target)) {
    response.writeHead(403).end("Forbidden");
    return;
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error("NOT_FILE");
    const body = await readFile(target);
    response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream", "cache-control": "no-store" });
    response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8" }).end("Not Found");
  }
}

createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const apiHandler = {
    "/api/job-search/run": handler,
    "/api/job-search/candidates": candidatesHandler,
    "/api/job-search/select": selectHandler
  }[pathname];
  if (apiHandler) {
    try {
      const raw = await readBody(request);
      request.body = raw ? JSON.parse(raw) : {};
      return apiHandler(request, response);
    } catch (error) {
      response.writeHead(error.status || 400, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: { code: error.message === "REQUEST_TOO_LARGE" ? "REQUEST_TOO_LARGE" : "INVALID_JSON", message: error.message === "REQUEST_TOO_LARGE" ? "请求不能超过1MB。" : "请求体不是合法 JSON。" } }));
      return;
    }
  }
  if (!["GET", "HEAD"].includes(request.method)) return response.writeHead(405).end("Method Not Allowed");
  return serveStatic(request, response);
}).listen(port, host, () => {
  console.log(`Qiguang local server: http://${host}:${port}`);
});
