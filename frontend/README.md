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

- 已完成：欢迎页、能力探索、能力图谱、岗位匹配、岗位详情和针对性训练六个核心界面。
- 已实现：页面跳转、问答记录、自定义答案提交、图谱与岗位卡展开、岗位详情折叠和课程勾选。
- 核心链路：真实经历问答 → 可追溯能力图谱 → 可解释岗位匹配 → 岗位条件判断 → 差距训练 → 本子持续积累。
- 当前为 Hackathon Demo，图谱计算、岗位和课程数据使用前端 mock。
- 待接入：真实数据、用户状态持久化、PDF 导出、收藏/投递及后端/模型接口。
