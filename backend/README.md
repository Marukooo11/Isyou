# Isyou Coach Backend

结论：这是一个零第三方依赖、可立即用于前端联调的 Coach 后端参考实现。它已经包含 SQLite 持久化、幂等请求、状态版本、完整 mock 状态机、跨天 Review，以及 `output1.v1.0 → 职业方向匹配 → Career Context → Quest Coach` 的串联链路；后续可以在不改变前端 API 的情况下，将确定性 Coach 决策替换为真实模型 provider。

## 运行

在仓库根目录执行：

```bash
python3 backend/server.py
```

默认地址：`http://127.0.0.1:8001`

另开一个终端启动现有前端：

```bash
cd frontend
python3 -m http.server 8000
```

打开：

- 产品 Demo：`http://127.0.0.1:8000/coach.html?mode=api`
- Coach 原始响应：`http://127.0.0.1:8000/coach-demo.html`
- Career → Coach 完整联调：`http://127.0.0.1:8000/career-coach-demo.html`

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `COACH_HOST` | `127.0.0.1` | 监听地址 |
| `COACH_PORT` | `8001` | API 端口 |
| `COACH_DATABASE_PATH` | `backend/data/coach.db` | SQLite 文件 |
| `COACH_ALLOWED_ORIGINS` | 本地 8000 端口 | 允许的前端 Origin，逗号分隔 |
| `COACH_ALLOW_DEMO_DATE` | `0` | 设为 `1` 后允许 `X-Coach-Date` 模拟次日 |
| `COACH_HTTP_LOG` | `1` | 设为 `0` 关闭访问日志 |

联调跨天 Review：

```bash
COACH_ALLOW_DEMO_DATE=1 python3 backend/server.py
```

## 测试

不需要安装 Pytest：

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```

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
- 统一错误格式与本地 CORS。
- `output1.v1.0` 画像关键字段与授权校验；
- 642 个职业的方向匹配、硬约束否决和五条推荐；
- 职业推荐到稳定 `career_context` 的转换；
- 一次请求完成“画像评估并创建 Coach 会话”；
- 合成画像联调页和 HTTP 端到端测试。

尚未实现：

- 真实模型 provider；
- Career Skill 的实时数据接入；
- 问卷逐题施测与自然语言答案抽取（当前从 Skill 生成的 `output1.v1.0` 开始）；
- 真实招聘信息检索与 JD 层地点、薪资、职级过滤；
- 登录与用户账号；
- 二进制文件上传；
- 生产部署与监控。

`coach/engine.py` 是当前可测试的确定性参考实现。接模型时保留相同输入、状态转移和 `CoachResponse`，不要让前端解析模型原始输出。

`career/matcher.py` 是飞书问卷 4.0 匹配规则的纯 Python 后端实现；`career/adapter.py` 只负责把职业方向和画像证据转换成 Coach 可消费的上下文。职业标签含 AI 初标，只用于方向探索，不能解释成心理诊断或真实岗位资格结论。
