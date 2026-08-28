(function (global) {
  "use strict";

  function defaultBaseUrl() {
    const location = global.location;
    if (!location || !/^https?:$/.test(location.protocol)) return "http://127.0.0.1:8001";
    const localStaticServer = ["127.0.0.1", "localhost"].includes(location.hostname)
      && location.port === "8000";
    if (localStaticServer) return location.protocol + "//" + location.hostname + ":8001";
    return location.origin;
  }

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
      this.baseUrl = (config.baseUrl || global.ISYOU_COACH_API || defaultBaseUrl()).replace(/\/$/, "");
      this.storageKey = config.storageKey || "isyou_coach_session_id";
      this.authStorageKey = config.authStorageKey || "isyou_auth_access_token_v1";
      this.sessionId = global.localStorage.getItem(this.storageKey);
      this.authToken = global.localStorage.getItem(this.authStorageKey);
      this.stateVersion = null;
      this.demoDate = config.demoDate || null;
    }

    async health() {
      return this._request("GET", "/api/v1/health");
    }

    async requestAuthCode(purpose, contactType, contact) {
      return this._request("POST", "/api/v1/auth/codes", {
        purpose: purpose,
        contact_type: contactType,
        contact: contact,
      });
    }

    async register(challengeId, code, username, password) {
      const response = await this._request("POST", "/api/v1/auth/register", {
        challenge_id: challengeId,
        code: code,
        username: username,
        password: password,
      });
      this._rememberAuth(response);
      return response;
    }

    async loginWithPassword(username, password) {
      const response = await this._request("POST", "/api/v1/auth/login/password", {
        username: username,
        password: password,
      });
      this._rememberAuth(response);
      return response;
    }

    async loginWithCode(challengeId, code) {
      const response = await this._request("POST", "/api/v1/auth/login/code", {
        challenge_id: challengeId,
        code: code,
      });
      this._rememberAuth(response);
      return response;
    }

    async me() {
      if (!this.authToken) return null;
      return this._request("GET", "/api/v1/auth/me");
    }

    async getSavedProfile() {
      return this._request("GET", "/api/v1/users/me/profile");
    }

    async logout() {
      if (this.authToken) await this._request("POST", "/api/v1/auth/logout", {});
      this.clear();
      this.clearAuth();
    }

    async start(context) {
      const response = await this._request("POST", "/api/v1/coach/sessions", context);
      this._remember(response);
      return response;
    }

    async evaluateCareer(profile, selectedOccupationId) {
      return this._request("POST", "/api/v1/career/evaluations", {
        profile: profile,
        selected_occupation_id: selectedOccupationId || undefined,
      });
    }

    async startFromCareerProfile(profile, selectedOccupationId, options) {
      const config = options || {};
      const response = await this._request("POST", "/api/v1/career/coach-sessions", {
        profile: profile,
        selected_occupation_id: selectedOccupationId || undefined,
        preferences: config.preferences || {},
      });
      this._remember(response.coach);
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

    clearAuth() {
      this.authToken = null;
      global.localStorage.removeItem(this.authStorageKey);
    }

    _remember(response) {
      this.sessionId = response.session_id;
      this.stateVersion = response.state_version;
      global.localStorage.setItem(this.storageKey, this.sessionId);
    }

    _rememberAuth(response) {
      this.authToken = response.access_token;
      global.localStorage.setItem(this.authStorageKey, this.authToken);
    }

    async _request(method, path, body) {
      const headers = { Accept: "application/json" };
      if (body !== undefined) headers["Content-Type"] = "application/json";
      if (this.demoDate) headers["X-Coach-Date"] = this.demoDate;
      if (this.authToken) headers.Authorization = "Bearer " + this.authToken;
      const response = await global.fetch(this.baseUrl + path, {
        method: method,
        headers: headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const payload = await response.json().catch(function () {
        return { error: { code: "INVALID_RESPONSE", message: "Coach 服务返回了无效数据" } };
      });
      if (!response.ok) {
        if (payload.error && payload.error.code === "AUTH_REQUIRED") this.clearAuth();
        throw new CoachApiError(payload.error, response.status);
      }
      return payload;
    }
  }

  global.IsyouCoach = { CoachClient: CoachClient, CoachApiError: CoachApiError };
})(window);
