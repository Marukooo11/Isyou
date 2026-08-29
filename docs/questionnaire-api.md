# Questionnaire API

> 结论：问卷 4.0 现在由后端提供结构化题库、按账号保存草稿，并用确定性规则生成 `output1.v1.0`；完成接口会立即调用 Career Matcher，把同一画像保存到可信 `user_id`。

## 数据流

```text
GET schema → 前端按条件显示 35 题
  → POST draft 自动保存/恢复
  → POST complete 生成 output1.v1.0
  → Career Matcher 重算就绪状态和 5 个方向
  → 当前账号画像持久化
```

除题库接口外均需要：

```http
Authorization: Bearer <access_token>
```

## `GET /api/v1/questionnaire/schema`

无需鉴权。返回：

- 7 个 section；
- 35 个正式题号；
- 每题 fields、options、显示条件和跳过能力；
- `output_schema_version=output1.v1.0`。

分支由前端和后端共同遵守：

- B3 决定 B4–B6；
- B7 为 `active/soon` 时显示 J1–J9；
- B7 为 `not_now` 时忽略旧的 J 页草稿，不把隐藏答案写入求职画像或授权。

## `GET /api/v1/questionnaire/draft`

读取当前账号草稿：

```json
{
  "schema_version": "questionnaire-draft.v1",
  "answers": {},
  "current_section": "background",
  "status": "in_progress",
  "updated_at": null,
  "completed_at": null
}
```

## `POST /api/v1/questionnaire/draft`

全量覆盖保存当前账号草稿：

```json
{
  "current_section": "ability",
  "answers": {
    "B7": {"value": "active"},
    "Q6": {
      "value": 7,
      "activity": "分析公开数据",
      "result": "完成一份报告"
    }
  }
}
```

跳过题目记录为 `{"_skipped": true}`。未知题号、非对象答案和超过 750 KB 的答案会被拒绝。

## `POST /api/v1/questionnaire/complete`

请求可带完整 `answers`；省略时使用已保存草稿。响应：

```json
{
  "schema_version": "questionnaire-result.v1",
  "profile": {"schema_version": "output1.v1.0"},
  "career_evaluation": {
    "schema_version": "career-evaluation.v1",
    "recommended_occupations": []
  }
}
```

评分器实现：

- Big Five 按评分说明中的正反向题确定性计算，保留 `source_question_ids`；
- 证据只来自用户实际填写的文本和 J2 结果，生成 `eu_id/source_question_id/text/strength/parsed`；
- 多元智能和三个方向仅按量表题与已有证据合成，不调用模型、不补写未知内容；
- J1–J9 直接映射求职事实，技能采用“每行 `技能：1/2/3`”的可复核格式；
- Career Matcher 负责最终 `job_matching_ready`、职业硬过滤和五方向推荐；
- 每次完成沿用同一 `profile_id` 并递增 `profile_version`。

## 当前边界

- 自由文本只做结构化拼接和明确格式解析，没有接入 LLM 语义抽取；
- 未实现动态追问 Skill、同义词归一、复杂经历多条动态表单；
- 不根据行业常识猜测技能、结果、证书、城市或授权；
- 真实 JD 检索和资格核验仍属于后续 handoff。
