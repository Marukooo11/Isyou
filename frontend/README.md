# Isyou Frontend

本目录是 `main` 分支当前可运行的前端版本。

## Run locally

```bash
cd frontend
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`。这是前后端分离方式；完整真实岗位链路默认运行 `python3 scripts/run_stack.py`，然后打开 `http://127.0.0.1:8001/`。

完整 Coach 联调需要在仓库根目录另开终端：

```bash
COACH_ALLOW_DEMO_DATE=1 python3 scripts/run_stack.py
```

从主 Demo 的岗位匹配页点击“让 Coach 为我规划”，未登录时会先进入 `auth.html`，完成注册或登录后回到 Coach。

## Files

- `index.html`：新版手帐式全流程入口，包含注册、问卷、能力图谱与职业方向；真实岗位阶段交给账号化 `job-search.html`，Mock 模式可在单页内演示完整视觉流程。
- `questionnaire-v4.js`：新版手帐问卷的 35 题结构与条件分支定义。
- `coach.html`、`coach.css`、`coach-page.js`：正式 Coach 交互页，包含对话、状态路径、8 类卡片、恢复会话和两日演示链路。
- `coach-client.js`：Coach API 客户端。
- `auth.html`：手机号/邮箱验证码注册，以及密码或验证码登录页。
- `questionnaire.html`：35 题条件问卷、自动保存/恢复、完成评分与 Career 联动。
- `job-search.html`：实时岗位候选、用户选择、原页核验与具体 JD Coach 入口。
- `career-coach-demo.html`：账号 → 导入问卷 `output1.v1.0` JSON → 五个职业方向 → Coach 的完整开发联调页。
- `coach-demo.html`：面向开发者的原始 API 数据联调页。
- `design-notes.html`：产品设计笔记。
- `support.js`、`image-slot.js`：页面运行时支持。
- `uploads/`：图片素材。

## Current status

- 已完成：现有“探索 → 图谱 → 岗位匹配 → 岗位详情”与“Coach 对话 → Gap Map → 阶段计划 → Day 1 → 成果反馈 → Day 2 Review → 动态任务”的顺滑连接。
- 同源部署时页面自动连接当前域名的真实 API；使用本地 `python -m http.server 8000` 时自动连接 `http://127.0.0.1:8001`。没有检测到后端时 Coach 页面可使用浏览器内 Demo 引擎。
- 两种模式使用相同的 `ui_blocks` 响应结构。前端包含 `question`、`gap_map`、`stage_plan`、`daily_task`、`review`、`feedback`、`evidence_update`、`notice` 八类渲染器。
- 访问令牌、会话 ID 和前端对话记录保存在 `localStorage`；后端画像与 Coach 状态保存在 SQLite，切换目标岗位会自动创建新的 Coach 会话，刷新不会丢进度。
- URL 参数：`?mode=api` 强制真实 API，`?mode=demo` 强制浏览器 Demo；默认 `auto`。
- 当前边界：35 题、真实 JD 和 Coach 已联通；实时搜索需要服务端 provider 密钥。真实短信/邮件、模型驱动 Coach 和生产安全仍待接入。

UI 设计和前端联调以 [`../documentation/frontend-integration.md`](../documentation/frontend-integration.md) 为准。
