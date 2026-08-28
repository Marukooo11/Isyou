# Coach API v0.1

> 前端只依赖本文件中的接口和响应结构。Coach 的 mock、真实模型或后续领域适配不得改变这些基础字段。

## Health

```http
GET /api/v1/health
```

## 创建会话

```http
POST /api/v1/coach/sessions
Content-Type: application/json
```

```json
{
  "client_user_id": "demo-user",
  "domain": "career",
  "career_context": {
    "selected_direction": {
      "id": "career-3d-scene",
      "title": "3D 场景相关方向",
      "source_refs": ["source-001"]
    },
    "target_requirements": [
      {
        "id": "req-portfolio",
        "text": "需要能够展示建模或场景制作能力的作品",
        "source_ref": "source-001"
      }
    ],
    "user_profile": {
      "facts": ["有建筑学习经历", "学过建模", "有绘画经验"],
      "evidence": [],
      "constraints": [],
      "open_questions": []
    }
  },
  "preferences": {
    "language": "zh-CN",
    "available_minutes": 30,
    "communication_style": "clear_and_supportive"
  }
}
```

## 恢复会话

```http
GET /api/v1/coach/sessions/{session_id}
```

如果上一学习日已结束且当前日期已变化，此接口会将状态推进到 `daily_review`，因此页面刷新后应以返回的最新 `state_version` 为准。

## 提交一轮交互

```http
POST /api/v1/coach/sessions/{session_id}/turns
Content-Type: application/json
```

```json
{
  "request_id": "frontend-generated-uuid",
  "expected_state_version": 1,
  "event": {
    "type": "answer_question",
    "action_id": "answer-start",
    "message": "我想先知道自己的差距",
    "evidence": []
  }
}
```

支持的事件：

```text
message
answer_question
confirm_gap_map
request_gap_change
confirm_plan
request_plan_change
submit_result
report_blocker
request_help
pause
resume
```

## 统一响应

```json
{
  "session_id": "coach-uuid",
  "state_version": 2,
  "phase": "gap_analysis",
  "coach_message": "...",
  "ui_blocks": [
    {"id": "gap-map", "type": "gap_map", "data": {"items": []}}
  ],
  "quick_actions": [
    {"id": "confirm-gap", "label": "这个分析基本准确", "event_type": "confirm_gap_map"}
  ],
  "state_summary": {
    "target_title": "3D 场景相关方向",
    "current_stage": null,
    "current_day": 1,
    "progress_label": "确认 Gap Map"
  },
  "updated_at": "2026-08-28T20:30:02+08:00"
}
```

P0 卡片类型：

```text
question
gap_map
stage_plan
daily_task
review
feedback
evidence_update
notice
```

## 错误

```json
{
  "error": {
    "code": "STATE_CONFLICT",
    "message": "会话状态已更新，请重新加载。",
    "retryable": true
  }
}
```

前端遇到 `STATE_CONFLICT` 时调用恢复会话接口，不要用旧状态重试写入。

