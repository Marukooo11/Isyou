# Isyou Frontend

本目录是 `main` 分支当前可运行的前端版本。

## Run locally

```bash
cd frontend
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`。

完整 Coach 联调需要在仓库根目录另开终端：

```bash
COACH_ALLOW_DEMO_DATE=1 python3 backend/server.py
```

从主 Demo 的岗位匹配页点击“让 Coach 为我规划”，或直接打开 `http://127.0.0.1:8000/coach.html`。

## Files

- `index.html`：主 Demo，包含欢迎页、能力探索、能力图谱、岗位匹配和岗位详情，并把所选岗位上下文传给 Coach。
- `coach.html`、`coach.css`、`coach-page.js`：正式 Coach 交互页，包含对话、状态路径、8 类卡片、恢复会话和两日演示链路。
- `coach-client.js`：Coach API 客户端。
- `coach-demo.html`：面向开发者的原始 API 数据联调页。
- `design-notes.html`：产品设计笔记。
- `support.js`、`image-slot.js`：页面运行时支持。
- `uploads/`：图片素材。

## Current status

- 已完成：现有“探索 → 图谱 → 岗位匹配 → 岗位详情”与“Coach 对话 → Gap Map → 阶段计划 → Day 1 → 成果反馈 → Day 2 Review → 动态任务”的顺滑连接。
- Coach 页面优先连接 `http://127.0.0.1:8001` 的真实 API；没有检测到后端时自动使用浏览器内 Demo 引擎，保证黑客松现场仍可完整点击。
- 两种模式使用相同的 `ui_blocks` 响应结构。前端包含 `question`、`gap_map`、`stage_plan`、`daily_task`、`review`、`feedback`、`evidence_update`、`notice` 八类渲染器。
- 会话 ID 和前端对话记录保存在 `localStorage`；切换目标岗位会自动创建新的 Coach 会话，刷新不会丢进度。
- URL 参数：`?mode=api` 强制真实 API，`?mode=demo` 强制浏览器 Demo；默认 `auto`。
- 当前边界：岗位与画像数据仍为前端 mock，真实模型 provider、Career Skill 实时数据、登录、文件上传和生产部署待接入。
