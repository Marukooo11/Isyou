import { publicError } from "../../lib/job-search/errors.mjs";
import { generateSelectedJob } from "../../lib/job-search/selection-pipeline.mjs";

function send(response, status, body) {
  response.statusCode = status;
  response.setHeader("content-type", "application/json; charset=utf-8");
  response.setHeader("cache-control", "no-store");
  response.end(JSON.stringify(body));
}

export default async function handler(request, response, dependencies = {}) {
  if (request.method !== "POST") return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 POST。" } });
  try {
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    return send(response, 200, await generateSelectedJob(body || {}, dependencies));
  } catch (error) {
    return send(response, Number(error.status || 500), { error: publicError(error) });
  }
}
