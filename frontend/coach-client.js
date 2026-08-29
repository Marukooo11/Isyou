(function (global) {
  "use strict";

  class CoachApiError extends Error {
    constructor(error, status) {
      super(error && error.message ? error.message : "Coach 服务请求失败");
      this.name = "CoachApiError";
      this.code = error && error.code ? error.code : "UNKNOWN_ERROR";
      this.retryable = Boolean(error && error.retryable);
      this.status = status;
    }
  }

  class CoachClient {
    constructor(options) {
      const config = options || {};
      this.baseUrl = (config.baseUrl || "http://127.0.0.1:8001").replace(/\/$/, "");
      this.storageKey = config.storageKey || "isyou_coach_session_id";
      this.sessionId = global.localStorage.getItem(this.storageKey);
      this.stateVersion = null;
      this.demoDate = config.demoDate || null;
    }

    async health() {
      return this._request("GET", "/api/v1/health");
    }

    async start(context) {
      const response = await this._request("POST", "/api/v1/coach/sessions", context);
      this._remember(response);
      return response;
    }

    async restore() {
      if (!this.sessionId) return null;
      try {
        const response = await this._request(
          "GET",
          "/api/v1/coach/sessions/" + encodeURIComponent(this.sessionId)
        );
        this._remember(response);
        return response;
      } catch (error) {
        if (error instanceof CoachApiError && error.code === "SESSION_NOT_FOUND") {
          this.clear();
          return null;
        }
        throw error;
      }
    }

    async turn(event) {
      if (!this.sessionId || this.stateVersion == null) {
        throw new Error("Coach 会话尚未创建或恢复");
      }
      const requestId = global.crypto && typeof global.crypto.randomUUID === "function"
        ? global.crypto.randomUUID()
        : "request-" + Date.now() + "-" + Math.random().toString(16).slice(2);
      const response = await this._request(
        "POST",
        "/api/v1/coach/sessions/" + encodeURIComponent(this.sessionId) + "/turns",
        {
          request_id: requestId,
          expected_state_version: this.stateVersion,
          event: event,
          client_time: new Date().toISOString(),
        }
      );
      this._remember(response);
      return response;
    }

    clear() {
      this.sessionId = null;
      this.stateVersion = null;
      global.localStorage.removeItem(this.storageKey);
    }

    _remember(response) {
      this.sessionId = response.session_id;
      this.stateVersion = response.state_version;
      global.localStorage.setItem(this.storageKey, this.sessionId);
    }

    async _request(method, path, body) {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (this.demoDate) headers["X-Coach-Date"] = this.demoDate;
      const response = await global.fetch(this.baseUrl + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(function () {
        return { error: { code: "INVALID_RESPONSE", message: "Coach 服务返回了无效数据" } };
      });
      if (!response.ok) throw new CoachApiError(payload.error, response.status);
      return payload;
    }
  }

  global.IsyouCoach = { CoachClient: CoachClient, CoachApiError: CoachApiError };
})(window);
