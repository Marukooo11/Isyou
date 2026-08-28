# 云端 Demo 部署

> 结论：当前仓库可作为一个服务部署。Python 进程同时提供前端静态文件、Auth/Career/Coach API 和 SQLite 存储，不需要再单独部署前端。

## Docker 直接运行

```bash
docker build -t isyou-demo .
docker run --rm -p 8001:8001 -v isyou-data:/data isyou-demo
```

打开 `http://127.0.0.1:8001/`。健康检查为 `GET /api/v1/health`。

Docker 镜像默认设置 `AUTH_DEMO_MODE=1`，验证码会随接口响应返回并由前端自动回填，适合 Hackathon 演示。这个模式等同于公开测试账号系统：**不要输入真实手机号、邮箱、密码或个人敏感画像，也不能作为生产注册系统。**

## 云平台配置

支持两类启动方式：

- 支持 Dockerfile 的平台：直接从仓库根目录构建；
- 支持 Procfile/启动命令的平台：使用 `python backend/server.py`。

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

## 打包前验证

```bash
PYTHONPATH=backend COACH_HTTP_LOG=0 python3 -m unittest discover -s backend/tests -v
docker build -t isyou-demo .
docker run --rm -p 8001:8001 isyou-demo
```

验证以下地址：

- `/`：主 Demo；
- `/auth.html`：注册/登录；
- `/questionnaire.html`：35 题问卷、草稿与画像生成；
- `/career-coach-demo.html`：问卷 JSON → 职业方向 → Coach 联调；
- `/api/v1/health`：后端健康状态。

## 生产化边界

Hackathon Demo 可运行不等于生产就绪。面向真实用户前至少需要：

- 关闭 `AUTH_DEMO_MODE`，接入真实邮件/短信 delivery；
- 使用 HTTPS、安全 Cookie、IP/设备限流、密码重置与账号注销；
- 将 SQLite 迁移到受管数据库或配置可靠备份；
- 接入真实模型 provider、自由文本语义抽取/动态追问与真实 JD 数据；
- 增加日志脱敏、监控、数据删除机制和隐私合规审查。
