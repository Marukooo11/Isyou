import { publicError } from "../../lib/job-search/errors.mjs";
import { runJobSearch } from "../../lib/job-search/pipeline.mjs";

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response, dependencies = {}) {
  if (request.method !== "POST") {
    response.setHeader("allow", "POST");
    return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 POST。" } });
  }
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    if (JSON.stringify(body || {}).length > 1_000_000) {
      return send(response, 413, { error: { code: "REQUEST_TOO_LARGE", message: "请求不能超过1MB。" } });
    }
    const result = await runJobSearch(body || {}, dependencies);
    return send(response, 200, result);
  } catch (error) {
    const status = Number(error.status || 500);
    return send(response, status, { error: publicError(error) });
  }
}
