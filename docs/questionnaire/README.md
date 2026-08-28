# Questionnaire 4.0 联调包

> 结论：仓库只保留前后端联调所需的三份源文档和一份 JS 参考引擎；运行时继续使用 Python Career Matcher 与现有 642 职业库，避免两套数据和两套引擎漂移。

## 联调边界

```text
35 题结构化问卷（本仓库已实现）
  → 自动保存/恢复 + 确定性评分
  → 生成完整 output1.v1.0
  → POST /api/v1/career/evaluations（Bearer 鉴权）
  → 按 user_id 保存画像并返回 5 个职业方向
  → POST /api/v1/career/coach-sessions
  → Quest Coach
```

本仓库已实现结构化施测、答案草稿、明确格式解析和四轨确定性评分；不使用 AI 猜测自由文本。`frontend/questionnaire.html` 完成后直接生成画像并调用 Career Matcher，也可在 `frontend/career-coach-demo.html` 导入外部 `output1.v1.0` JSON。

## 已纳入仓库

| 文件 | 用途 | SHA-256 |
|---|---|---|
| `questionnaire-v4.md` | 35 题正文、条件分支和 J1–J9 求职事实页 | `aab0c791…b02b77` |
| `scoring-v4.md` | A/B/C/D 四轨评分、证据规则、就绪判定 | `1e8eb6c8…e3c8cb2` |
| `output1-v1-contract.md` | 前端、信息收集模块和后端唯一交接契约 | `ddaac73f…a2c7c6` |
| `reference/match_engine.mjs` | 原始 JS 引擎审计参考，不参与服务运行 | `70012daa…73e73` |

源资料中的 `occupation.json` 与 `backend/career/data/occupations.json` 内容完全一致（SHA-256 `6aac4bf8…9167357`），因此不重复上传。Python 版 Matcher 是当前服务运行时，并通过相同 fixture 做链路测试。

## 本轮不上传

| 内容 | 原因 |
|---|---|
| 两个 ZIP | 与目录内容重复，不适合代码审查和版本 diff |
| 两份 `作用说明.docx` | 内容已由本 README 和源文档覆盖 |
| `校准与维护文件/` | 属于职业库重建/人工校准源，不是 P0 联调运行时；待确认数据来源、许可和维护负责人后再单独纳入 |
| 第二份 `occupation.json` | 与后端运行时完全相同，重复后容易漂移 |

## 接口最小要求

信息收集模块交付前至少保证：

- 顶层 `schema_version` 为 `output1.v1.0`；缺失信息写 `null`、`unknown` 或空数组，不猜测；
- `profile_status.job_matching_ready` 的判定遵循评分说明 8.1；
- `evidence_units[]` 使用 `eu_id / source_question_id / text / strength / parsed / linked_capabilities / linked_intelligences / user_status`；
- `consent.can_use_for_job_matching=false` 或关键求职事实缺失时，`recommended_occupations=[]`；
- 画像更正后增加 `profile_version` 并重新计算，而不是新造字段。

后端 Adapter 同时兼容早期 fixture 的 `evidence_unit_id/claim`，但新代码应使用上述正式字段。

## 已知资料问题

- 源文档多处引用 `output1.sample.json`，本次交付目录和 ZIP 中均没有该文件。仓库的 `frontend/fixtures/profile-ready.json` 是合成联调数据，不冒充官方样板。
- 字段说明附录写过“643 职业”，实际交付数据和运行时均为 642 条；以数据文件的 `meta.count` 和测试结果为准。
- DOCX 说明中部分文件名带“智能-”前缀，实际交付文件名没有该前缀；仓库已用稳定英文名消除引用歧义。
