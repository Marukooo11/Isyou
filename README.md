# Isyou

Isyou 是一个帮助用户理解自身能力、探索职业可能，并将方向转化为具体行动路径的 Web Demo。

## Demo Goal

本次 Hackathon 的目标不是完成一个完整产品，而是在有限时间内跑通一条完整、可展示的核心链路。

**Demo 截止时间：Day 4 24:00**

优先级：

1. 核心链路完整可运行
2. 关键 AI 能力真实可用
3. 前端体验清晰、可展示
4. 非核心能力可以使用 mock 数据

## Core Flow

用户进入
→ 基础信息与可选信息收集
→ 用户信息结构化
→ 能力 / 兴趣识别
→ 职业方向匹配
→ 用户选择目标方向
→ 生成行动 / 训练路径
→ Web 端展示结果

## Repository Structure

* `frontend/`：Web 页面与交互
* `backend/`：AI / Agent / 匹配逻辑与接口
* `assets/`：图片、截图、流程图等
* `.env.example`：环境变量示例

## Current Ownership

| 模块            | 负责人 | 当前状态        |
| ------------- | --- | ----------- |
| 用户信息收集 / 前端呈现 | TBD | In Progress |
| 用户画像 / 核心逻辑   | TBD | In Progress |
| 职业匹配 / Skill  | TBD | In Progress |
| 商业化相关         | TBD | In Progress |
| 整体整合 / Demo   | TBD | In Progress |

后续根据实际分工持续更新。

## Collaboration

* `main` 保持为当前可运行版本
* 多人同时开发时，各自在独立 branch 开发
* 完成后再合并回 `main`
* 不要提交 API Key、密码或其他敏感信息
* API Key 等统一放在本地 `.env`
* 新增功能前优先确认是否属于 Demo 必要链路，避免 Day 3 之后继续扩范围

## Demo Principle

**先跑通，再做漂亮；先保证完整，再补智能。**

如果某个功能无法在截止时间前稳定实现，优先使用 mock 或固定数据保证 Demo 链路完整。

