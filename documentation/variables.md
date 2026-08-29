# Variables and Secrets

| Name | Used by | Scope/source | Risk / rotation |
|---|---|---|---|
| `OPENAI_API_KEY` | Node provider | server secret | Search access; rotate at provider and redeploy |
| `OPENAI_SEARCH_MODEL` | Node provider | server config | Exact supported model ID |
| `OPENAI_BASE_URL` | Node provider | server config | Must be trusted endpoint |
| `GOOGLE_CSE_API_KEY` / `GOOGLE_CSE_ID` | Node provider | server secret/config | Search access; rotate in Google console |
| `JOB_SEARCH_PROVIDER` | Node | server config | Selects provider implementation |
| `JOB_SEARCH_PROXY_URL` | Node | server config | Proxy sees outbound traffic; trusted only |
| `JOB_SEARCH_TIMEOUT_MS` | Node | server config | Availability/cost control |
| `JOB_SEARCH_CACHE_HOURS` | Node | server config | Must not exceed 24 without revalidation |
| `JOB_MATCHER_HOST/PORT` | Node | server config | Default loopback/3000 |
| `JOB_MATCHER_BASE_URL` | Python | server config | Internal trusted endpoint only |
| `JOB_MATCHER_TIMEOUT_SECONDS` | Python | server config | Must exceed expected search latency |
| `COACH_DATABASE_PATH` | Python | server config | Contains accounts, profiles, JD snapshots, Coach data |
| `AUTH_DEMO_MODE` | Python | server config | Dangerous when real data is entered |
| `AUTH_DEV_SHOW_CODE` | Python | local-only config | Must be 0 outside local loopback |
| `COACH_ALLOWED_ORIGINS` | Python | server config | Browser origin allowlist |
| `PORT` / `COACH_HOST` | Python | platform config | Public listener |

No provider secret is referenced by `frontend/`. `.env.local` is gitignored.

## Pre-go-live

- Disable demo/dev verification codes.
- Rotate any key used during shared testing.
- Confirm Node binds to loopback or is protected as an internal service.
- Use HTTPS and move auth token to Secure/HttpOnly/SameSite Cookie.
- Back up or migrate SQLite; define profile/JD deletion policy.
- Confirm logs do not contain profile, token, provider response or full JD body.
