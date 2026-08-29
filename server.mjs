import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import dotenv from "dotenv";
import runHandler from "./api/job-search/run.mjs";
import candidatesHandler from "./api/job-search/candidates.mjs";
import selectHandler from "./api/job-search/select.mjs";

dotenv.config({ path: resolve(import.meta.dirname, ".env.local"), override: true });

const defaultRoot = resolve(import.meta.dirname);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".ico": "image/x-icon"
};

const apiHandlers = new Map([
  ["/api/job-search/run", runHandler],
  ["/api/job-search/candidates", candidatesHandler],
  ["/api/job-search/select", selectHandler]
]);

function setSecurityHeaders(response) {
  response.setHeader("x-content-type-options", "nosniff");
  response.setHeader("x-frame-options", "DENY");
  response.setHeader("referrer-policy", "strict-origin-when-cross-origin");
  response.setHeader("permissions-policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("content-security-policy", "default-src 'self'; script-src 'self' 'unsafe-eval' https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data:; font-src 'self' data: https://fonts.gstatic.com; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
}

function sendJson(response, status, body, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(JSON.stringify(body));
}

async function readBody(request, maxBytes = 1_000_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("REQUEST_TOO_LARGE"), { status: 413 });
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw Object.assign(new Error("INVALID_JSON"), { status: 400 });
  }
}

function requestIp(request, trustProxy) {
  if (trustProxy) {
    const forwarded = String(request.headers["x-forwarded-for"] || "").split(",")[0].trim();
    if (forwarded) return forwarded;
  }
  return request.socket.remoteAddress || "unknown";
}

function createRateLimiter({ max, windowMs }) {
  const buckets = new Map();
  return ip => {
    if (max <= 0) return { allowed: true, remaining: Infinity, retryAfter: 0 };
    const now = Date.now();
    const current = buckets.get(ip);
    const bucket = !current || now - current.startedAt >= windowMs ? { startedAt: now, count: 0 } : current;
    bucket.count += 1;
    buckets.set(ip, bucket);
    if (buckets.size > 2_000) for (const [key, value] of buckets) if (now - value.startedAt >= windowMs) buckets.delete(key);
    return {
      allowed: bucket.count <= max,
      remaining: Math.max(0, max - bucket.count),
      retryAfter: Math.max(1, Math.ceil((windowMs - (now - bucket.startedAt)) / 1000))
    };
  };
}

async function serveStatic(request, response, root) {
  const requested = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
  const relative = requested === "/" ? "index.html" : requested.replace(/^\/+/, "");
  const target = resolve(root, relative);
  if (!target.startsWith(`${root}${sep}`) || /(^|[\\/])(?:\.env(?:\.[^\\/]+)?|node_modules|tests|scripts)([\\/]|$)/i.test(target)) {
    response.writeHead(403, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("Forbidden");
    return;
  }
  try {
    if (!(await stat(target)).isFile()) throw new Error("NOT_FILE");
    const body = await readFile(target);
    const cacheControl = extname(target) === ".html" ? "no-store" : "public, max-age=300";
    response.writeHead(200, { "content-type": mime[extname(target).toLowerCase()] || "application/octet-stream", "cache-control": cacheControl });
    if (request.method === "HEAD") response.end();
    else response.end(body);
  } catch {
    response.writeHead(404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" });
    response.end("Not Found");
  }
}

export function createIsyouServer({ root = defaultRoot, env = process.env } = {}) {
  const rateLimit = createRateLimiter({
    max: Number(env.API_RATE_LIMIT_MAX ?? 30),
    windowMs: Number(env.API_RATE_LIMIT_WINDOW_MS ?? 600_000)
  });
  const trustProxy = env.TRUST_PROXY === "1";

  return createServer(async (request, response) => {
    setSecurityHeaders(response);
    try {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if (pathname === "/health") {
        if (!['GET', 'HEAD'].includes(request.method)) return sendJson(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 GET。" } }, { allow: "GET, HEAD" });
        return sendJson(response, 200, {
          status: "ok",
          service: "isyou-complete",
          search_provider_configured: Boolean(env.OPENAI_API_KEY || (env.GOOGLE_CSE_API_KEY && env.GOOGLE_CSE_ID))
        });
      }

      const apiHandler = apiHandlers.get(pathname);
      if (apiHandler) {
        const limit = rateLimit(requestIp(request, trustProxy));
        response.setHeader("x-ratelimit-remaining", String(limit.remaining));
        if (!limit.allowed) return sendJson(response, 429, { error: { code: "RATE_LIMITED", message: "请求过于频繁，请稍后再试。" } }, { "retry-after": String(limit.retryAfter) });
        request.body = await readBody(request);
        return apiHandler(request, response, { env });
      }

      if (!["GET", "HEAD"].includes(request.method)) {
        response.writeHead(405, { allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
        return response.end("Method Not Allowed");
      }
      return serveStatic(request, response, root);
    } catch (error) {
      const code = error.message === "REQUEST_TOO_LARGE" ? "REQUEST_TOO_LARGE" : error.message === "INVALID_JSON" ? "INVALID_JSON" : "INTERNAL_ERROR";
      const status = Number(error.status || 500);
      const message = code === "REQUEST_TOO_LARGE" ? "请求不能超过 1MB。" : code === "INVALID_JSON" ? "请求体不是合法 JSON。" : "服务器处理请求时发生错误。";
      return sendJson(response, status, { error: { code, message } });
    }
  });
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (isMain) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PORT 必须是 1-65535 的整数。");
  createIsyouServer().listen(port, host, () => {
    console.log(`Isyou server: http://${host}:${port}`);
  });
}
