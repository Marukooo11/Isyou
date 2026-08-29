# Career Adapter

结论：本模块跑通的是“已评分画像 → 职业方向 → Coach”的稳定交接，不负责施测 35 道问卷，也不声称已经完成真实 JD 匹配。

## 输入与输出

输入是信息收集 Skill 或问卷评分器生成的 `output1.v1.0`。关键输入包括：

- `big5_scores` 与 `intelligence_profile`；
- `job_search_profile`；
- `user_work_profile.constraints`；
- `evidence_units`；
- `consent.can_use_for_job_matching`。

正式交接字段以 [`docs/questionnaire/output1-v1-contract.md`](../../docs/questionnaire/output1-v1-contract.md) 为准。`evidence_units` 优先读取 `eu_id` 与 `text`，同时兼容早期联调数据中的 `evidence_unit_id` 与 `claim`。

`CareerMatcher` 返回更新后的完整画像；HTTP API 只返回联调需要的状态、五条推荐和 `career_context`，避免把 642 条全量排序发送给前端。

## 规则边界

- 未知字段按缺失处理，不用默认值猜测。
- `job_matching_ready=false` 时推荐为空，不能启动职业 Coach。
- 职业层可以执行资格、频繁出差、客户面向、环境和经验标签过滤。
- 地点、薪资、行业、雇佣类型和真实 JD 资格核验仍属于后续 handoff。
- 当前职业库标签含 AI 初标；所有结论均为职业方向探索，不是心理诊断或录用建议。

## 文件

- `matcher.py`：纯函数式职业打分与五条推荐。
- `adapter.py`：把推荐方向、画像事实、证据和待核验项转成 `career_context`。
- `service.py`：评估与一键启动 Coach 的应用服务。
- `data/occupations.json`：内部 Hackathon 数据快照。
