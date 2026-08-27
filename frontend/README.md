# Isyou Frontend

本目录是 `main` 分支当前可运行的前端版本。

## Run locally

```bash
cd frontend
python3 -m http.server 8000
```

浏览器打开 `http://localhost:8000`。

## Files

- `index.html`：主 Demo，包含欢迎页、能力探索、能力图谱、岗位匹配、岗位详情和培训路径。
- `design-notes.html`：产品设计笔记。
- `support.js`、`image-slot.js`：页面运行时支持。
- `uploads/`：图片素材。

## Current status

- 已完成：六个核心界面和页面间交互。
- 当前为 Hackathon Demo，问卷、画像、岗位和课程数据使用前端 mock。
- 待接入：真实问卷数据、用户状态持久化、后端/模型接口。
