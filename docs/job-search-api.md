# Real Job Search API

> 结论：前端只调用 Isyou Python API；完整画像、搜索候选原文和选定 JD 均由服务端按 `user_id` 保存。浏览器不能自报画像、候选 URL 或 Coach 要求。

所有接口均需：

```http
Authorization: Bearer <access_token>
Content-Type: application/json
```

## 接口顺序

```text
POST /api/v1/job-search/candidates
  → POST /api/v1/job-search/select
  → POST /api/v1/job-search/coach-sessions
  → GET/POST /api/v1/coach/sessions/...
```

页面刷新时调用 `GET /api/v1/job-search/state` 恢复最近一次搜索和选择。

## 搜索 5 个候选

```http
POST /api/v1/job-search/candidates
```

```json
{"market":"CN","language":"zh-CN"}
```

服务端从当前账号读取已保存的 `output1.v1.0`，并检查：

- 已生成 `recommended_occupations`；
- `consent.can_use_for_web_job_search=true`；
- 浏览器没有机会替换画像内容。

成功响应：

```json
{
  "schema_version": "job-search-candidates.v1",
  "search_id": "job-search-uuid",
  "status": "complete",
  "candidate_count": 5,
  "candidates": [
    {
      "candidate_id": "CANDIDATE-001",
      "title": "数据分析师",
      "company": "示例公司",
      "location": "上海",
      "snippet": "搜索摘要",
      "source_url": "https://...",
      "direction_id": "OCC-0001",
      "direction_title": "数据分析",
      "discovery_status": "search_result_unverified"
    }
  ],
  "warning": null
}
```

`discovery_status=search_result_unverified` 是必须展示的真实性边界：候选只是搜索发现，尚未访问原页面核验。

## 选择并核验一个岗位

```http
POST /api/v1/job-search/select
```

```json
{
  "search_id": "job-search-uuid",
  "candidate_id": "CANDIDATE-001"
}
```

前端不得提交 `source_url`。Python 服务从该账号的搜索快照中取回候选，再调用 Node 服务核验原始页面、执行硬约束检查并生成结构化 JD 与 Markdown。

```json
{
  "schema_version": "job-selection.v1",
  "selection_id": "job-selection-uuid",
  "search_id": "job-search-uuid",
  "candidate_id": "CANDIDATE-001",
  "status": "complete",
  "verification_status": "verified",
  "selected_job": {
    "schema_version": "output2.jd.v1.0",
    "opportunity_id": "OPP-001",
    "title": "数据分析师",
    "company": "示例公司",
    "source_url": "https://...",
    "verification_status": "verified",
    "tasks": [],
    "required": [],
    "preferred": [],
    "tools": [],
    "education_experience": [],
    "schedule_location_collaboration": [],
    "conditions": [],
    "constraint_checks": []
  },
  "file": {
    "filename": "jd_selected.md",
    "opportunity_id": "OPP-001",
    "content": "---\nschema_version: output2.jd.v1.0\n---\n..."
  }
}
```

## 从选定 JD 创建 Coach

```http
POST /api/v1/job-search/coach-sessions
```

```json
{
  "selection_id": "job-selection-uuid",
  "preferences": {
    "language": "zh-CN",
    "available_minutes": 20,
    "communication_style": "clear_and_supportive"
  }
}
```

`JobCoachAdapter` 将选定 JD 映射为：

- `selected_direction`：具体岗位，而不是抽象职业方向；
- `target_requirements`：必备要求、学历经验、工具、职责和协作条件；
- `user_profile`：问卷中的用户事实、证据、限制和待确认条件；
- `selected_job`：Coach 可引用的结构化岗位快照。

成功响应中的 `coach` 与 [`coach-api.md`](coach-api.md) 完全相同。前端保存 `coach.session_id` 后进入 `/coach.html?mode=api`。

## 恢复岗位搜索状态

```http
GET /api/v1/job-search/state
```

返回当前账号最近的 `search` 与 `selection`。为减少敏感数据暴露，恢复响应不返回完整画像，也不返回 Markdown 正文。

## 主要错误码

| HTTP | code | 前端行为 |
|---:|---|---|
| 401 | `AUTH_REQUIRED` | 跳转登录，并带 `next=job-search.html` |
| 403 | `WEB_SEARCH_NOT_AUTHORIZED` | 引导用户回问卷 J9 开启联网授权 |
| 404 | `JOB_SEARCH_NOT_FOUND` | 清空本地搜索状态，重新搜索 |
| 404 | `JOB_CANDIDATE_NOT_FOUND` | 候选已失效，刷新候选列表 |
| 404 | `JOB_SELECTION_NOT_FOUND` | 返回候选页重新选择 |
| 409 | `PROFILE_REQUIRED` | 跳转问卷 |
| 409 | `PROFILE_NOT_READY` | 展示问卷缺失项并返回补答 |
| 422 | `SELECTED_OPPORTUNITY_NOT_VERIFIED` | 保留候选列表，提示选择其他岗位 |
| 422 | `SELECTED_OPPORTUNITY_HARD_CONFLICT` | 明示与硬约束冲突，不允许启动 Coach |
| 502 | `JOB_MATCHER_UNAVAILABLE` | 保留现有状态，提供重试 |
| 502 | `SEARCH_PROVIDER_UNAVAILABLE` | 提示搜索服务异常，不显示“0 个合适岗位” |

## 耗时边界

候选搜索可能约 45 秒，选择后的原页核验也可能需要数秒。当前为同步 HTTP：前端需显示持续加载文案、禁用重复提交，并允许用户离开页面；不得用空列表伪装超时或服务失败。
