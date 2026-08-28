# Isyou Coach Backend

结论：Python API 本身零第三方依赖，并与内部 Node job-matcher 组成完整 Demo 后端。链路为“注册/登录 → 问卷 → output1 → 职业方向 → 真实 JD → JobCoachAdapter → Coach”。

## 运行

在仓库根目录执行：

```bash
cd job-matcher && npm ci && cp .env.example .env.local && cd ..
python3 scripts/run_stack.py
```

默认地址：`http://127.0.0.1:8001`，同时提供 `frontend/` 静态文件。

打开：

- 产品 Demo：`http://127.0.0.1:8001/`
- Coach 原始响应：`http://127.0.0.1:8001/coach-demo.html`
- Career → Coach 完整联调：`http://127.0.0.1:8001/career-coach-demo.html`
- 真实问卷：`http://127.0.0.1:8001/questionnaire.html`
- 真实岗位：`http://127.0.0.1:8001/job-search.html`

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `COACH_HOST` | `127.0.0.1` | 监听地址 |
| `COACH_PORT` | `8001` | API 端口 |
| `PORT` | 空 | 云平台端口；`COACH_PORT` 未设置时使用 |
| `COACH_DATABASE_PATH` | `backend/data/coach.db` | SQLite 文件 |
| `COACH_SERVE_FRONTEND` | `1` | 同进程托管 `frontend/` |
| `COACH_ALLOWED_ORIGINS` | 本地 8000 端口 | 允许的前端 Origin，逗号分隔 |
| `COACH_ALLOW_DEMO_DATE` | `0` | 设为 `1` 后允许 `X-Coach-Date` 模拟次日 |
| `COACH_HTTP_LOG` | `1` | 设为 `0` 关闭访问日志 |
| `AUTH_DEV_SHOW_CODE` | `1` | 仅本地联调：在响应中显示验证码；非回环地址会拒绝启动 |
| `AUTH_DEMO_MODE` | `0` | 公开 Hackathon Demo 显式回填验证码；不得输入真实资料或用于生产 |
| `JOB_MATCHER_BASE_URL` | `http://127.0.0.1:3000` | Python 访问内部岗位服务 |
| `JOB_MATCHER_TIMEOUT_SECONDS` | `90` | 候选搜索/核验超时 |
| `JOB_MATCHER_HOST/PORT` | `127.0.0.1/3000` | Node 内部监听地址 |

联调跨天 Review：

```bash
COACH_ALLOW_DEMO_DATE=1 python3 scripts/run_stack.py
```

## 测试

不需要安装 Pytest：

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```

当前 20 项 Python 测试覆盖认证、问卷、用户隔离、职业方向、岗位编排和 Coach；Node 模块另有 13 项测试。

## 当前实现边界

已实现：

- 首次 Coach 对话；
- Gap Map；
- 阶段计划确认；
- Day 1 动态任务；
- 卡点时降低摩擦；
- 提交结果与证据记录；
- 次日自动进入 Review；
- 根据“完成 / 部分完成 / 卡住”生成不同 Day 2；
- SQLite 跨刷新和重启恢复；
- 请求幂等与状态冲突保护；
- 统一错误格式与本地 CORS；
- 手机号/邮箱 6 位验证码、注册和两种登录方式；
- 密码/验证码/访问令牌哈希存储与 Bearer 鉴权；
- 服务端签发稳定 `user_id`，画像与 Coach 会话按用户隔离；
- `output1.v1.0` 画像关键字段与授权校验；
- 642 个职业的方向匹配、硬约束否决和五条推荐；
- 职业推荐到稳定 `career_context` 的转换；
- 一次请求完成“画像评估并创建 Coach 会话”；
- 合成画像联调页和 HTTP 端到端测试。
- 35 题结构化 schema、条件分支、草稿恢复和确定性 `output1.v1.0` 评分器；
- 前端/API 单服务部署、同源 CORS、云平台 `PORT`、Docker 与 Procfile。
- 真实岗位候选搜索、选择后原页核验、按用户保存搜索/选择和 `output2.jd.v1.0`；
- 选定 JD 到具体岗位 Coach context 的转换与 HTTP E2E。

尚未实现：

- 真实模型 provider；
- 真实短信与邮件 delivery provider（本地当前回填 `dev_code`）；
- LLM 自由文本语义抽取、动态追问和复杂同义词归一；
- 搜索 provider 无密钥时不能执行实时 JD 请求；
- 二进制文件上传；
- 生产级 delivery、数据库、部署监控与隐私合规。

`coach/engine.py` 是当前可测试的确定性参考实现。接模型时保留相同输入、状态转移和 `CoachResponse`，不要让前端解析模型原始输出。

`career/matcher.py` 是飞书问卷 4.0 匹配规则的纯 Python 后端实现；`career/adapter.py` 只负责把职业方向和画像证据转换成 Coach 可消费的上下文。职业标签含 AI 初标，只用于方向探索，不能解释成心理诊断或真实岗位资格结论。
