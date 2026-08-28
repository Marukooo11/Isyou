# 前端与 UI 联调说明

> 一句话结论：设计稿按“注册 → 问卷 → 画像完成 → 搜索候选 → 选择并核验 → 具体 JD Coach”六段设计；前端只保存访问令牌和流程 ID，不传完整画像、候选 URL 或岗位要求。

## 1. 产品主链路

```text
注册/登录
  → 35 题问卷（自动保存）
  → output1 画像 + 5 个职业方向
  → 用户明确发起联网搜索
  → 展示 1–5 个未核验岗位候选
  → 用户选择一个候选
  → 服务端核验原页面与硬约束
  → 展示选定 JD 摘要
  → 用户启动 Coach
  → Gap Map → 阶段计划 → 每日任务 → Review
```

关键边界：职业方向不是具体 JD；搜索候选不是已核验岗位；只有 `verification_status=verified/partially_verified` 且无明确硬冲突时，才能进入 Coach。

## 2. 页面与状态

### A. 注册/登录 `/auth.html`

| 状态 | UI 内容 | 主操作 |
|---|---|---|
| 未登录 | 邮箱/手机号、验证码、用户名、密码 | 注册并登录 |
| 已登录 | 用户名、脱敏联系方式 | 继续 |
| 验证码发送中 | 禁用发送按钮 | 等待结果 |
| 错误 | 在表单附近展示服务端 `message` | 保留已填内容 |

登录成功后的 `next` 默认是 `questionnaire.html`。若从岗位页被拦截，使用 `auth.html?next=job-search.html`。

### B. 问卷 `/questionnaire.html`

| 状态 | UI 内容 | 设计要求 |
|---|---|---|
| 恢复中 | 骨架/“正在恢复进度” | 不先显示空白问卷后跳页 |
| 作答中 | 章节导航、问题卡、跳过 | 650ms 自动保存，不弹成功 Toast |
| 有未保存修改 | 轻量状态文案 | 不阻塞继续作答 |
| 保存失败 | 固定错误提示 + 再次编辑触发重试 | 不清空答案 |
| 完成中 | “生成画像和职业方向” | 禁用所有重复提交 |
| 完成 | 五个方向摘要 | 主按钮“搜索真实岗位” |
| 不可匹配 | 缺失字段列表 | 主按钮“返回补答” |

J9 的“允许检索公开招聘信息”必须是用户主动选择，默认不视为同意。

### C. 岗位搜索 `/job-search.html`

这是设计联调重点页，至少覆盖以下状态：

| state | 页面内容 | 主操作 |
|---|---|---|
| `idle` | 解释会使用哪些信息、隐私边界 | 搜索 5 个岗位 |
| `searching` | 持续加载；文案提示首次可能约 45 秒 | 禁止重复搜索 |
| `candidate_partial` | 1–4 个候选 + 数量不足说明 | 仍允许选择 |
| `candidate_complete` | 5 个候选 | 每张卡“选择并核验” |
| `search_error` | 明确错误，不显示“0 个适合岗位” | 重试/返回问卷 |
| `verifying` | 所选卡进入核验中，其余按钮禁用 | 等待原页面核验 |
| `verified` | JD 摘要、来源链接、已核验要求 | 为这个岗位启动 Coach |
| `verification_failed` | 页面失效/无法核验 | 返回选择其他岗位 |
| `hard_conflict` | 明确展示冲突的用户硬限制 | 不提供启动 Coach |
| `starting_coach` | 正在生成 Gap Map 起点 | 禁止重复创建 |

候选卡建议字段：岗位名、公司、城市、来源职业方向、搜索摘要、`选择后核验原页面` 标签。不要在候选卡显示匹配百分比，也不要使用“推荐你投递”。

选定 JD 卡建议字段：岗位名、公司、地点、办公方式、雇佣形式、薪资、来源链接、必备要求、工具、未知待确认条件、核验时间。

### D. Coach `/coach.html?mode=api`

Coach 首页标题使用具体 JD 标题。页面不需要重新请求 JD；创建会话响应已经把结构化岗位快照写入 Coach state。

Coach 固定阶段：

```text
onboarding
→ gap_analysis
→ plan_review
→ daily_learning
→ submission_review
→ 下一学习日 daily_learning
```

UI 只根据 `phase / ui_blocks / quick_actions / workspace` 渲染，不从 `coach_message` 文案反推业务状态。

## 3. 前端 API 调用顺序

| 顺序 | 调用 | 成功后保存 | 下一状态 |
|---:|---|---|---|
| 1 | `POST /api/v1/questionnaire/complete` | 无需浏览器保存 profile | 画像完成 |
| 2 | `POST /api/v1/job-search/candidates` | `search_id` | 候选列表 |
| 3 | `POST /api/v1/job-search/select` | `selection_id` | 选定 JD |
| 4 | `POST /api/v1/job-search/coach-sessions` | `coach.session_id` | Coach onboarding |
| 5 | `POST /api/v1/coach/sessions/{id}/turns` | 更新 `state_version` | 按 phase 推进 |

刷新岗位页时先调用 `GET /api/v1/job-search/state`。刷新 Coach 页时调用 `GET /api/v1/coach/sessions/{session_id}`。

前端禁止：

- 在搜索请求中提交本地 profile；
- 在选择请求中提交或覆盖 `source_url`；
- 在创建 Coach 时提交自定义 `target_requirements`；
- 用前端自报 `user_id` 决定数据归属；
- 把搜索超时渲染为“没有合适岗位”。

## 4. 前端状态模型建议

```ts
type JobSearchPageState =
  | { kind: "idle" }
  | { kind: "searching" }
  | { kind: "candidates"; searchId: string; items: Candidate[]; partial: boolean }
  | { kind: "verifying"; searchId: string; candidateId: string }
  | { kind: "selected"; selectionId: string; job: SelectedJob }
  | { kind: "error"; code: string; recoverTo: "questionnaire" | "search" | "candidates" };
```

服务端是流程状态的真实来源；浏览器状态只用于渲染。页面恢复后以 `/job-search/state` 覆盖本地状态。

## 5. 错误与恢复动作

| code | 用户可读文案重点 | UI 恢复动作 |
|---|---|---|
| `AUTH_REQUIRED` | 登录状态已失效 | 登录后回原页面 |
| `WEB_SEARCH_NOT_AUTHORIZED` | 尚未授权联网岗位搜索 | 跳问卷 J9 |
| `PROFILE_REQUIRED` | 尚未完成画像 | 跳问卷开头/恢复点 |
| `PROFILE_NOT_READY` | 求职事实不完整 | 展示缺失项并补答 |
| `JOB_MATCHER_UNAVAILABLE` | 岗位服务暂时不可用 | 保留页面并重试 |
| `SEARCH_PROVIDER_UNAVAILABLE` | 搜索服务异常 | 不清空历史结果 |
| `JOB_SEARCH_NOT_FOUND` | 搜索记录已失效 | 重新搜索 |
| `JOB_CANDIDATE_NOT_FOUND` | 候选已失效 | 刷新候选 |
| `SELECTED_OPPORTUNITY_NOT_VERIFIED` | 原始页面无法核验 | 回候选列表 |
| `SELECTED_OPPORTUNITY_HARD_CONFLICT` | 与明确硬限制冲突 | 禁止启动 Coach |
| `STATE_CONFLICT` | Coach 已在别处更新 | 自动恢复最新会话 |

所有错误保留服务端 `code` 供逻辑判断，显示服务端中文 `message`。不要把原始堆栈、provider 响应或 API Key 暴露到页面。

## 6. 加载、空态和文案边界

- 搜索加载：`正在搜索公开岗位，首次可能需要约 45 秒…`
- 候选边界：`这些是搜索发现，选择前尚未核验原始页面。`
- 核验加载：`正在访问并核验所选岗位原页面…`
- 部分结果：`目前找到 N 个可展示候选，可以先选择或稍后重试。`
- 搜索错误：`岗位搜索服务暂时不可用，请稍后重试。`，不能写“没有适合你的岗位”。
- 未知字段：统一展示“待向招聘方确认”，不能填“无要求”。
- Coach 边界：Gap 是基于当前画像和 JD 的待验证差距，不是能力判决。

## 7. 响应式和可访问性最低要求

- 搜索、核验、创建 Coach 三种长操作都要有 `aria-live` 状态；
- 禁用按钮仍需保留可读加载文案；
- 候选卡移动端改为单列，主操作位于卡片内容之后；
- 错误不能只用红色区分，必须有文字；
- 外链添加 `target=_blank rel="noopener noreferrer"`；
- 不把完整邮箱、手机号、画像或 Markdown 写入分析埋点。

## 8. 本地联调

```bash
cd job-matcher
npm ci
cp .env.example .env.local
# 填写一个搜索 provider 配置
cd ..
python3 scripts/run_stack.py
```

打开：

- `http://127.0.0.1:8001/auth.html`
- `http://127.0.0.1:8001/questionnaire.html`
- `http://127.0.0.1:8001/job-search.html`
- `http://127.0.0.1:8001/coach.html?mode=api`

## 9. UI 联调验收清单

- [ ] 未登录访问岗位页会跳登录并能返回；
- [ ] 未授权联网时不会发起 provider 请求；
- [ ] 搜索中不能重复点击；
- [ ] 候选明确标记“未核验”；
- [ ] 选择只发送 `search_id + candidate_id`；
- [ ] 原页失效后可以返回选择其他候选；
- [ ] 硬约束冲突时不能进入 Coach；
- [ ] 刷新岗位页能恢复最近搜索与选择；
- [ ] Coach 标题是具体岗位名；
- [ ] Coach Gap 引用选定 JD 要求，不引用搜索摘要；
- [ ] 另一账号不能读取或选择当前账号的搜索结果；
- [ ] 超时/服务失败不会伪装成零结果。

完整字段见 [`../docs/job-search-api.md`](../docs/job-search-api.md) 和 [`../docs/coach-api.md`](../docs/coach-api.md)。
