# Architecture

> Isyou 是同源前端 + Python 账号/画像/编排 API + 内部 Node 岗位搜索服务 + SQLite 的职业探索 Demo。浏览器只信任 Python API；Node job-matcher 默认只监听回环地址。

## Components

| Component | Runtime | Responsibility |
|---|---|---|
| `frontend/` | Browser | 注册、问卷、岗位选择、Coach UI |
| `backend/server.py` | Python | 同源静态文件、Bearer 鉴权、API 路由 |
| `backend/auth` | Python/SQLite | 用户、验证码、token、画像和岗位搜索记录 |
| `backend/questionnaire` | Python | 35 题、草稿、确定性 output1 |
| `backend/career` | Python | 642 职业方向、Career Adapter |
| `backend/job_search` | Python | 用户级编排、Node client、JD→Coach Adapter |
| `job-matcher/` | Node | 联网搜索、原页核验、硬约束和 output2 JD |
| `backend/coach` | Python/SQLite | 通用 Coach 状态机、会话、turn、Review |

## End-to-end data path

```text
Browser ─Bearer→ Python API ─user_id→ SQLite
                         └─最小化 output1→ Node job-matcher ─→ search/provider + public JD pages
                         ← candidates / selected_job + Markdown
                         └─JobCoachAdapter→ Coach state→ SQLite
```

账号归属只来自 token。Python 向 Node 发送经过 `privacy.mjs` 再次裁剪的画像；浏览器不直连 Node，不持有 provider secret。

## Trust boundaries

| Crossing | Trust decision |
|---|---|
| Browser → Python | Bearer token 解析 user_id；忽略客户端自报 user_id |
| Python → SQLite | 所有画像、搜索、选择和 Coach 查询带 user_id |
| Python → Node | 仅内部 `JOB_MATCHER_BASE_URL`；默认回环监听 |
| Node → provider | 必须有 `can_use_for_web_job_search=true`；只发送裁剪画像 |
| Node → public page | SSRF 防护、原页核验、未知字段保持未知 |
| selected JD → Coach | 只通过 `JobCoachAdapter` 的固定结构进入 |

## Known risks / assumptions

- Bearer token 仍存 `localStorage`；见 `frontend/coach-client.js`。生产需安全 Cookie。
- Node 搜索为同步长请求，首次可能约 45 秒；见 `job-matcher/HANDOFF-JOB-MATCHER.md`。
- Python 与 Node 之间没有共享密钥，安全依赖 Node 只监听回环地址；见 `job-matcher/server.mjs`。
- SQLite 依赖应用层 user_id 过滤，没有数据库 RLS；见 `backend/auth/storage.py`、`backend/coach/storage.py`。
- Demo 验证码模式会把验证码返回浏览器；只适合无真实数据演示。
- Coach 当前是确定性参考引擎，不是模型驱动的个性化教学 provider。

没有邮件队列、定时任务。公开产品页未实现动态 SEO，因此不单建 `emails.md`、`cron.md` 或 `seo.md`。

## Related Documents

- [Frontend integration](frontend-integration.md)
- [Flows](flows.md)
- [Permissions](permissions.md)
- [Variables](variables.md)
- [Tests](tests.md)
- [Automation](automation.md)
- [Job search API](../docs/job-search-api.md)
- [Coach API](../docs/coach-api.md)
