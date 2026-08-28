# 云端 Demo 部署

> 结论：当前仓库可作为一个容器部署。容器内 Python 提供同源前端/Auth/问卷/Coach API，Node job-matcher 只监听回环端口并负责真实岗位搜索。

## 本地完整联调

```bash
cd job-matcher
npm ci
cp .env.example .env.local
# 填写 OpenAI 或 Google 搜索 provider
cd ..
python3 scripts/run_stack.py
```

## Docker 直接运行

```bash
docker build -t isyou-demo .
docker run --rm -p 8001:8001 -v isyou-data:/data \
  -e OPENAI_API_KEY=... \
  -e JOB_SEARCH_PROVIDER=openai \
  isyou-demo
```

打开 `http://127.0.0.1:8001/`。健康检查为 `GET /api/v1/health`。

Docker 镜像默认设置 `AUTH_DEMO_MODE=1`，验证码会随接口响应返回并由前端自动回填，适合 Hackathon 演示。这个模式等同于公开测试账号系统：**不要输入真实手机号、邮箱、密码或个人敏感画像，也不能作为生产注册系统。**

## 云平台配置

支持两类启动方式：

- 支持 Dockerfile 的平台：直接从仓库根目录构建；
- 支持 Procfile/启动命令且能安装 Node 子目录依赖的平台：使用 `python scripts/run_stack.py`；否则把 `job-matcher/` 部署为内部服务并设置 `JOB_MATCHER_BASE_URL`。

服务器会优先读取平台注入的 `PORT`，并在有 `PORT` 时默认监听 `0.0.0.0`。建议配置持久化磁盘并将 `COACH_DATABASE_PATH` 指向挂载目录，例如 `/data/coach.db`；否则重启或重新部署后账号、画像和 Coach 会话可能丢失。

| 环境变量 | 云端 Demo 推荐值 | 说明 |
|---|---|---|
| `PORT` | 平台自动注入 | HTTP 端口 |
| `COACH_HOST` | `0.0.0.0` | 监听所有容器接口 |
| `COACH_DATABASE_PATH` | `/data/coach.db` | SQLite 持久化位置 |
| `COACH_SERVE_FRONTEND` | `1` | 同进程托管 `frontend/` |
| `AUTH_DEMO_MODE` | `1` | 显示并自动回填验证码，仅限无真实数据的演示环境 |
| `AUTH_DEV_SHOW_CODE` | `0` | 云端不要使用本地开发开关 |
| `COACH_ALLOW_DEMO_DATE` | `0` | 默认关闭客户端模拟日期 |
| `COACH_ALLOWED_ORIGINS` | 可留空/默认 | 同源部署自动允许；仅在前后端分离时填写前端 Origin |
| `JOB_MATCHER_BASE_URL` | `http://127.0.0.1:3000` | Python 到内部 Node 服务 |
| `JOB_MATCHER_HOST` | `127.0.0.1` | Node 默认只监听回环地址 |
| `JOB_MATCHER_PORT` | `3000` | Node 内部端口 |
| `JOB_MATCHER_TIMEOUT_SECONDS` | `90` | Python 等待搜索/核验的上限 |
| `JOB_SEARCH_PROVIDER` | `openai` 或 `google` | 实时搜索 provider |
| `OPENAI_API_KEY` 等 | 平台 secret | 只供 Node 使用，禁止进入前端 |

## 打包前验证

```bash
PYTHONPATH=backend COACH_HTTP_LOG=0 python3 -m unittest discover -s backend/tests -v
cd job-matcher && npm test && npm run check && cd ..
docker build -t isyou-demo .
docker run --rm -p 8001:8001 isyou-demo
```

验证以下地址：

- `/`：主 Demo；
- `/auth.html`：注册/登录；
- `/questionnaire.html`：35 题问卷、草稿与画像生成；
- `/job-search.html`：实时候选 → 选择 → 核验 → Coach；
- `/career-coach-demo.html`：问卷 JSON → 职业方向 → Coach 联调；
- `/api/v1/health`：后端健康状态。

## 生产化边界

Hackathon Demo 可运行不等于生产就绪。面向真实用户前至少需要：

- 关闭 `AUTH_DEMO_MODE`，接入真实邮件/短信 delivery；
- 使用 HTTPS、安全 Cookie、IP/设备限流、密码重置与账号注销；
- 将 SQLite 迁移到受管数据库或配置可靠备份；
- 为同步岗位搜索增加异步任务、进度查询、缓存监控和 provider 限额治理；
- 增加日志脱敏、监控、数据删除机制和隐私合规审查。
