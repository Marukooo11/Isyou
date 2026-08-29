# Automation and External Search

## Real-job search automation

| Item | Contract |
|---|---|
| Trigger | Authenticated user explicitly presses “搜索 5 个岗位” |
| Owner | Current token user_id |
| Automatic? | No; requires explicit web-search consent and user action |
| Inputs allowed | Accepted directions, job facts, verified skills/tools, location, employment type, confirmed constraints |
| Inputs forbidden | Name/contact, raw evidence text, personality scores, unaccepted claims |
| APIs/tools | Configured search provider; HTTPS fetch of public source pages |
| Output | `job-search-candidates.v1`, then `output2.jd.v1.0` for one selected job |
| App side effects | Python stores search/selection snapshots by user_id |
| Guardrails | Consent check, privacy crop, SSRF checks, original-page verification, hard constraints, 5-result cap |
| Failure | Structured error; never convert provider failure to “0 suitable jobs” |
| Kill switch | Remove provider secret or stop internal Node service |

Provider/model prompts steer search and extraction, but permission, field minimization, candidate ownership, URL retrieval, hard-conflict blocking and output schemas are code-enforced outside prompts.

## Coach automation

Current `CoachEngine` is deterministic and provider-neutral. It runs only after the user selects a verified JD and presses “启动 Coach”. It can create Gap Map, stage plan, daily tasks and Review records, but it has no external tool access and sends no messages outside the app.

If a model-backed Coach is added later, its tool surface, prompt location, approval gates, retry/kill switch and validated output schema must be documented here before release.
