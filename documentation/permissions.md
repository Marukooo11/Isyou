# Permissions

## Identities

| Identity | Source | Scope |
|---|---|---|
| Anonymous browser | no token | health, questionnaire schema, auth endpoints, static files |
| Authenticated user | hashed Bearer token → auth_sessions.user_id | own profile, draft, searches, selections, Coach sessions |
| Python API | server process | SQLite and internal Node API |
| Node job-matcher | internal process | configured provider and public JD URLs; no SQLite access |

## Resource matrix

| Resource / operation | Anonymous | Authenticated owner | Other authenticated user |
|---|---:|---:|---:|
| Questionnaire schema/read static UI | Allow | Allow | Allow |
| Own draft/profile read/write | Deny | Allow | Deny |
| Start real-job search | Deny | Allow with web consent | Deny |
| Read/select stored candidate | Deny | Allow | Deny/404 |
| Start Coach from selection | Deny | Allow | Deny/404 |
| Read/advance Coach session | Deny | Allow | Deny/404 |

SQLite has no row-level security. Isolation is enforced in storage queries with `user_id`; tests pin cross-account denial for Coach and job search resources.

No admin or staff role exists in the current application.
