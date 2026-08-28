# Verification Map

## Existing coverage

| Use case | Rule / expected deny case | Evidence | Status |
|---|---|---|---|
| Registration/login | Same account keeps stable user_id; wrong/expired code denied | `backend/tests/test_auth.py` | Existing automated |
| Questionnaire | 35 unique questions, branches, drafts, profile versions | `backend/tests/test_questionnaire.py` | Existing automated |
| Career directions | No consent means no recommendations; ready profile returns five | `backend/tests/test_career.py` | Existing automated |
| Real-job privacy | Raw evidence/personality/identity not sent; no web consent denied | `job-matcher/tests/job-search.test.mjs` | Existing automated |
| JD authenticity | Original page extraction; missing conditions stay unknown | `job-matcher/tests/job-search.test.mjs` | Existing automated |
| Hard constraints | Explicit conflict excludes; unknown does not pretend to match | `job-matcher/tests/job-search.test.mjs` | Existing automated |
| Candidate interaction | One search returns five candidates; selection returns one output2 JD | `job-matcher/tests/selection.test.mjs` | Existing automated |
| End-to-end orchestration | Questionnaire → candidates → select → JobCoachAdapter → Coach | `backend/tests/test_http_career.py` | Existing automated |
| Cross-account job access | Other user cannot select stored search | `backend/tests/test_http_career.py` | Existing automated |
| Cross-account Coach access | Other user gets session not found | `backend/tests/test_http_career.py` | Existing automated |
| Coach integrity | Idempotent turns and state-version conflict | `backend/tests/test_service.py` | Existing automated |

Current local suite: 20 Python tests and 13 Node tests. There is no CI workflow, so these do not yet gate merges to `main`.

## Proposed tests

| Type | Case | Expected |
|---|---|---|
| Automated integration | Start real Node HTTP server with fixture provider and Python proxy | Same contracts as fake-client E2E |
| Guarded live | Provider returns five current public candidates | Sources are valid and no secrets/profile leak |
| Guarded live | Select one candidate whose page expired between steps | `SELECTED_OPPORTUNITY_NOT_VERIFIED` |
| Browser E2E | Register → questionnaire with web consent → candidates → Coach | Correct loading/recovery states and target title |
| Manual review | Screen reader and keyboard flow through long operations | Status announced; no inaccessible disabled state |
| Automated security | SSRF variations, redirects, DNS rebinding | Private/internal destinations rejected |

## Gaps

| Priority | Unverified rule | Exposure |
|---:|---|---|
| P0 | No CI-required test workflow | Regressions can merge silently |
| P0 | Python↔Node transport has no service credential | Unsafe if Node is exposed beyond loopback |
| P1 | Browser E2E does not exercise a real provider | UI latency/error behavior may drift |
| P1 | SQLite backup/deletion workflow has no test | User data durability/privacy risk |
| P2 | Search cache expiry and provider rate behavior lack operational tests | Stale jobs or cost spikes |
