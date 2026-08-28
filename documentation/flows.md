# Security and Side-effect Flows

## Registration and login

- Actor: anonymous user.
- Preconditions: valid email/phone; fresh six-digit challenge.
- Flow: browser → Python AuthService → hashed challenge/user/token in SQLite → Bearer token to browser.
- Deny cases: expired/reused/wrong code, duplicate username/contact, rate limit.
- Side effects: user and auth session rows.

## Questionnaire completion

- Actor: authenticated user.
- Authz: token supplies `user_id`; draft/profile writes use only that ID.
- Flow: browser answers → Python scorer → CareerMatcher → `user_profiles`.
- Deny cases: missing token, malformed/oversized answers, unknown question IDs.
- Side effects: draft status completed; output1 profile version increments.

## Real-job candidate search

- Actor: authenticated user with saved profile and explicit web consent.
- Authz: Python loads profile by token user_id; browser cannot provide profile.
- Trust crossings: Python → Node → external search provider.
- Data minimization: Node `createSearchSafeProfile` removes personality scores, raw evidence and direct identity.
- Deny cases: no profile, no accepted directions, no web consent, provider unavailable.
- Side effects: one `job_search_runs` row containing the profile snapshot and candidate result.

## Candidate selection and original-page verification

- Actor: owner of the stored search.
- Authz: query uses `search_id + token user_id`; candidate is retrieved server-side by candidate_id.
- Trust crossing: Node fetches the persisted source URL and applies SSRF/original-page checks.
- Deny cases: another user, unknown candidate, rejected page, explicit hard conflict.
- Side effects: one `selected_jobs` row with structured JD and Markdown.

## Selected JD to Coach

- Actor: owner of the selected job.
- Authz: `selection_id + token user_id`; profile comes from the matching search snapshot.
- Flow: selected_job + profile → JobCoachAdapter → trusted career_context → CoachService.
- Deny cases: unknown selection, wrong schema, missing source/title/opportunity ID.
- Side effects: Coach session row; no new external request.

## Coach turns

- Actor: owner of the Coach session.
- Authz: session and turn lookups include token user_id.
- Integrity: request_id idempotency and expected_state_version conflict check.
- Side effects: session state, turn record, evidence/Review state.
