# Isyou

> 结论：Isyou 已跑通“注册/登录 → 可信 user_id → 导入问卷 output1.v1.0 → 画像持久化 → 职业方向匹配 → Quest Coach → Gap Map/每日行动”的本地 MVP 链路，可直接用于前后端自助联调。

Isyou 帮助用户从真实经历中理解自身能力、探索职业方向，并把目标转化为可持续的行动路径。当前仓库同时包含可交互前端、零第三方依赖的 Python 后端、SQLite 持久化、642 个职业的方向匹配器和确定性 Quest Coach 参考实现。

本仓库保持 Private，不使用公开 GitHub Pages；团队成员通过本地启动完成联调。

## 快速开始

无需安装 Python 包。在仓库根目录启动后端：

```bash
COACH_ALLOW_DEMO_DATE=1 AUTH_DEV_SHOW_CODE=1 python3 backend/server.py
```

另开一个终端启动前端：

```bash
cd frontend
python3 -m http.server 8000
```

推荐入口：

- 产品主链路：`http://127.0.0.1:8000/`，从岗位页点击“让 Coach 为我规划”；
- 注册/登录：`http://127.0.0.1:8000/auth.html`；
- 完整开发联调：`http://127.0.0.1:8000/career-coach-demo.html`；
- Coach 原始响应：`http://127.0.0.1:8000/coach-demo.html`。

本地 `AUTH_DEV_SHOW_CODE=1` 会在接口响应中返回 6 位验证码，前端自动回填。该模式仅允许绑定回环地址，不能用于部署环境。

## 当前完整链路

```text
手机号或邮箱获取 6 位验证码
  → 验证码 + 用户名 + 密码注册
  → 用户名 + 密码，或手机号/邮箱 + 验证码登录
  → 服务端签发稳定 user_id 和访问令牌
  → 保存 output1.v1.0 画像
  → 在 642 个职业中生成 5 个探索方向
  → 用户选择方向并转换为 Career Context
  → 创建归属于该 user_id 的 Quest Coach 会话
  → 确认 Gap Map、阶段计划和每日任务
  → 保存提交证据并在下一学习日 Review
```

账号归属只从 `Authorization: Bearer <access_token>` 解析。后端会忽略前端自报的 `client_user_id`；其他账号即使知道 Coach `session_id` 也不能读取该会话。

## 已实现

- **账号**：邮箱/手机号二选一注册，6 位随机验证码，用户名和密码；支持密码登录与验证码登录；
- **安全存储**：密码使用 PBKDF2-SHA256，验证码和访问令牌只存哈希；验证码有有效期、错误次数和重发冷却；
- **用户数据**：账号、登录会话、画像快照、Coach 会话、交互轮次和证据记录统一保存到 SQLite，并按 `user_id` 隔离；
- **职业方向**：对 `output1.v1.0` 做关键字段/授权检查、职业硬约束过滤和 5 个方向推荐；
- **问卷交接**：纳入问卷 4.0 正文、评分规则和正式字段契约；联调页可直接导入上游生成的本地 JSON；
- **Career Adapter**：把用户选择的职业方向、画像事实、证据、约束和待确认项转换为稳定 `career_context`；
- **Quest Coach**：首次对话、Gap Map、阶段计划、Day 1、卡点降级、结果提交、次日 Review 和动态 Day 2；
- **联调界面**：主产品页、独立注册登录页、Career → Coach 全链路页和原始 API 调试页；
- **工程保证**：请求幂等、状态版本冲突保护、本地 CORS、统一错误结构和 HTTP 端到端测试。

## 核心 API

| 目的 | 方法与路径 | 鉴权 |
|---|---|---|
| 获取注册/登录验证码 | `POST /api/v1/auth/codes` | 否 |
| 注册 | `POST /api/v1/auth/register` | 否 |
| 用户名密码登录 | `POST /api/v1/auth/login/password` | 否 |
| 手机号/邮箱验证码登录 | `POST /api/v1/auth/login/code` | 否 |
| 当前账号 | `GET /api/v1/auth/me` | Bearer |
| 已保存画像 | `GET /api/v1/users/me/profile` | Bearer |
| 评估职业方向 | `POST /api/v1/career/evaluations` | Bearer |
| 评估并创建 Coach | `POST /api/v1/career/coach-sessions` | Bearer |
| 读取 Coach 会话 | `GET /api/v1/coach/sessions/{session_id}` | Bearer |
| 推进 Coach | `POST /api/v1/coach/sessions/{session_id}/turns` | Bearer |

详细契约见 [`docs/questionnaire/README.md`](docs/questionnaire/README.md)、[`docs/auth-api.md`](docs/auth-api.md)、[`docs/career-api.md`](docs/career-api.md) 和 [`docs/coach-api.md`](docs/coach-api.md)。

## 测试

```bash
PYTHONPATH=backend COACH_HTTP_LOG=0 python3 -m unittest discover -s backend/tests -v
```

测试覆盖邮箱/手机号注册、两种登录、错误/过期验证码、未登录拦截、正式 `evidence_units` 字段交接、画像落库、伪造 user_id、跨账号会话隔离，以及 Career → Coach → Gap Map 的 HTTP 链路。

## 当前边界

- 真实短信/邮件尚未接入；部署前必须设置 `AUTH_DEV_SHOW_CODE=0` 并替换 `DevelopmentCodeDelivery`；
- 当前前端使用 `localStorage` 保存 Bearer token；生产建议迁移为 HTTPS + Secure/HttpOnly/SameSite Cookie，并补 IP/设备限流、密码重置、联系方式换绑和账号注销；
- 当前后端从已经生成的 `output1.v1.0` 开始，35 题施测和自然语言答案抽取仍由上游信息收集 Skill 负责；
- 职业主分来自 Big Five 与多元智能，技能/经历只参与就绪判断和同分排序，结果是职业方向探索，不是真实岗位胜任度；
- 真实 JD 的地点、薪资、职级和资格过滤，以及真实模型 provider 尚未接入；
- 642 职业库含 AI 初标，仅供内部方向探索，公开发布前需要复核来源和许可；
- 主 Demo 的部分能力图谱和岗位展示数据仍为前端 mock，真实账号化链路以 `career-coach-demo.html` 和后端 API 为准。

## 仓库结构

```text
backend/
  auth/             # 用户、验证码、密码和登录会话
  career/           # 职业匹配器、642 职业库与 Career Adapter
  coach/            # Quest Coach 状态机与 SQLite 会话存储
  tests/            # 单元测试与 HTTP E2E
  server.py         # 零依赖 HTTP 服务
frontend/
  index.html        # 产品主 Demo
  auth.html         # 注册/登录
  coach.html        # 正式 Coach 界面
  career-coach-demo.html
docs/               # Auth、Career、Coach API 契约
  questionnaire/    # 问卷 4.0、评分规则、output1 契约与 JS 参考引擎
assets/previews/    # 团队评审截图
```

## 团队协作

| 模块 | 负责人 | 当前状态 |
|---|---|---|
| 用户提问逻辑 | [Song Tian Xin](https://github.com/xts5210) | In Progress |
| 信息收集 Skill | [Inna](https://github.com/Inna9725) | In Progress |
| 商业化 | [LiXin](https://github.com/lixinkimkin-gif) | In Progress |
| 前端 / 设计 / 整体整合 | [Marukooo11](https://github.com/Marukooo11) | Demo Ready |
| 认证 / Career Adapter / Quest Coach 后端 | 待团队确认长期负责人 | MVP Ready |

- `main` 保持为当前可运行版本，多人开发使用独立分支并通过 PR 合并；
- 不提交 API Key、真实密码、验证码、访问令牌或个人敏感画像；
- 新增能力先判断是否属于核心链路，无法稳定实现时明确标记 mock 或边界，不伪装成已完成。

## Demo 原则

**先跑通，再做漂亮；先保证完整，再补智能。**
