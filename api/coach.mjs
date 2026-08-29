import { CoachError, CoachService } from "../lib/coach/service.mjs";

function send(response, status, body) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

function publicError(error) {
  if (error instanceof CoachError) return { code: error.code, message: error.message, retryable: error.retryable };
  return { code: "INTERNAL_ERROR", message: "Coach 暂时无法处理请求。", retryable: true };
}

export function createCoachHandler({ service = new CoachService() } = {}) {
  return async function coachHandler(request, response, pathname) {
    try {
      if (pathname === "/api/v1/health") {
        if (!['GET', 'HEAD'].includes(request.method)) return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 GET。", retryable: false } });
        return send(response, 200, { status: "ok", service: "isyou-coach", version: "0.1.0" });
      }
      if (pathname === "/api/v1/coach/sessions") {
        if (request.method !== "POST") return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 POST。", retryable: false } });
        return send(response, 201, service.createSession(request.body || {}));
      }
      const turn = pathname.match(/^\/api\/v1\/coach\/sessions\/([^/]+)\/turns$/);
      if (turn) {
        if (request.method !== "POST") return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 POST。", retryable: false } });
        return send(response, 200, service.handleTurn(decodeURIComponent(turn[1]), request.body || {}));
      }
      const session = pathname.match(/^\/api\/v1\/coach\/sessions\/([^/]+)$/);
      if (session) {
        if (!['GET', 'HEAD'].includes(request.method)) return send(response, 405, { error: { code: "METHOD_NOT_ALLOWED", message: "只支持 GET。", retryable: false } });
        return send(response, 200, service.getSession(decodeURIComponent(session[1])));
      }
      return send(response, 404, { error: { code: "NOT_FOUND", message: "Coach 接口不存在。", retryable: false } });
    } catch (error) {
      return send(response, Number(error.status || 500), { error: publicError(error) });
    }
  };
}
