# Career Adapter API v0.1

> 一句话结论：前端可先评估五个职业方向，再把用户选中的方向直接转换为现有 Quest Coach 会话。

## 评估职业方向

```http
POST /api/v1/career/evaluations
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "profile": { "schema_version": "output1.v1.0" },
  "selected_occupation_id": "OCC-0001"
}
```

`selected_occupation_id` 可省略，默认选择排序第一条；若传入，必须来自本次五条推荐。

响应只包含前端联调需要的信息：

```json
{
  "schema_version": "career-evaluation.v1",
  "profile_id": "PROFILE-DEMO-001",
  "profile_status": { "job_matching_ready": true },
  "recommended_occupations": [],
  "selected_occupation": {},
  "career_context": {},
  "library": { "schema_version": "1.1", "occupation_count": 642 },
  "boundary": {
    "result_type": "occupation_direction_match",
    "real_jd_filtering_completed": false,
    "scoring_note": "当前主分来自 Big Five 与多元智能；技能和经历用于就绪判断及同分排序，不代表真实岗位胜任度。"
  }
}
```

这条边界用于避免把“职业方向探索”误解成“真实岗位胜任度”。真实 JD 的地点、薪资、职级、资格与具体技能要求仍需在下游核验。

## 画像评估并创建 Coach 会话

```http
POST /api/v1/career/coach-sessions
Authorization: Bearer <access_token>
Content-Type: application/json
```

```json
{
  "profile": { "schema_version": "output1.v1.0" },
  "selected_occupation_id": "OCC-0001",
  "client_user_id": "demo-user",
  "preferences": {
    "language": "zh-CN",
    "available_minutes": 30,
    "communication_style": "clear_and_supportive"
  }
}
```

响应：

```json
{
  "career_evaluation": {},
  "coach": {
    "session_id": "coach-uuid",
    "state_version": 1,
    "phase": "onboarding",
    "ui_blocks": []
  }
}
```

后续交互继续使用原有接口：

```http
POST /api/v1/coach/sessions/{session_id}/turns
Authorization: Bearer <access_token>
```

`user_id` 只从 Bearer token 解析；请求中的 `client_user_id` 不参与账号归属判断。每次职业评估会将最新完整画像保存到当前用户的 `user_profiles`。

## 就绪失败

若授权、城市、职级、雇佣类型、最低薪资或经历/技能证据缺失：

- `/career/evaluations` 返回 `job_matching_ready=false`、空推荐与 `missing_critical_fields`；
- `/career/coach-sessions` 返回 `400 INVALID_REQUEST`，不会创建半成品会话。

## 联调页面

启动后端和 `frontend/` 静态服务，打开：

```text
http://127.0.0.1:8000/career-coach-demo.html
```

页面默认加载 `frontend/fixtures/profile-ready.json` 合成画像，可直接体验：评估 → 选方向 → 启动 Coach → 回答起点问题 → Gap Map。
