# 智能-问卷4.0 数据字段说明

**用途**：定义问卷 4.0 的输出数据结构，供前端画像页、用户信息收集 Skill、真实岗位匹配模块三方联调。
**数据交接样板**：`output1.sample.json`（schema `output1.v1.0`）。**字段无法获得时使用 null、unknown 或空数组，不得删除关键字段，不得由 AI 猜测填充。**

**相对 3.0 版的对齐与瘦身**：顶层对齐样板（新增 profile_status / consent / job_search_profile / recommended_occupations / handoff，meta 扩展 data_quality_checks）；删除与样板重复或失去题目来源的字段（清单见《智能-字段清单.md》第一节）。

**两种属性风格**（与样板一致）：

- **画像类字段**（basic_info、user_work_profile、direction_scores 等 Psychological 层）：五元属性 `value / source_question_ids / evidence_unit_ids / confidence(evidence|self_report|unknown) / user_status(accepted|corrected|rejected|uncertain)`。
- **资格事实类字段**（job_search_profile）：三元属性 `source(user_reported|calculated_from_experiences|project|mixed|certificate_and_self_report) / confidence(high|medium|low) / user_status`。

---

## 一、总体结构（output1.v1.0）

```json
{
  "schema_version": "output1.v1.0",
  "profile_id": "PROFILE-____-___",
  "profile_version": 1,
  "created_at": "ISO-8601",
  "updated_at": "ISO-8601",
  "locale": "zh-CN",

  "profile_status": { "completion_level", "job_matching_ready", "confidence", "missing_critical_fields[]", "warnings[]" },
  "consent": { "can_use_for_job_matching", "can_use_for_web_job_search", "can_generate_external_materials", "can_share_sensitive_information_externally", "behavior_inference_enabled", "sensitive_info_requires_confirmation" },

  "basic_info": { "age_band", "education_level", "experience_types", "primary_experience", "experience_domain", "experience_distress_attribution", "zero_experience" },
  "user_work_profile": {
    "capabilities": [], "task_preference": {}, "cognitive_style": {}, "communication": {},
    "environment": {}, "energy": {}, "values": {}, "constraints": []
  },
  "big5_scores": { "E", "A", "C", "N", "O" },
  "intelligence_profile": { 八项智能 + "top_list" },
  "direction_scores": [ 3 个方向 ],

  "job_search_profile": {
    "education": {}, "experience_summary": {}, "experiences": [], "skills": [], "portfolio": [],
    "languages": [], "location_preferences": {}, "employment_preferences": {},
    "compensation": {}, "eligibility": {}, "industry_preferences": {}
  },

  "occupation_match": [ 全量排序结果 ],
  "recommended_occupations": [ 恰好 5 条 或 空数组 ],

  "evidence_units": [],
  "unverified_clues": [],

  "handoff": { "consumer", "allowed_uses[]", "required_processing_rules[]" },
  "meta": { ..., "generator": "intelligent-questionnaire-4.0", "data_quality_checks": {} }
}
```

---

## 二、题目字段定义（4.0 · 前端表单层）

| question_id | question_text（简称） | 类型 | 显示条件 |
|---|---|---|---|
| B1 | 人生阶段 | single | 始终 |
| B2 | 求学经历（＋追问：专业、毕业/预计年份） | single＋text | 始终 |
| B3 | 经历类型（分支入口） | multi | 始终 |
| B4 | 优先讲述段 | single（动态选项） | B3 勾选 A–E ≥2 项 |
| B5 | 经历领域 | single | B3 含 A–E 任一项 |
| B6 | 该段感受 | scale_1_7 | 同 B5 |
| B6.f1/.f2/.f3 | 归因／不排斥部分／做了什么多久 | text | B6 已答 |
| B7 | 求职状态（补充页开关） | single | 始终 |
| Q1 | 晨间顺序〔C+〕 | scale_1_7 | 始终 |
| Q3 | 陌生人〔E+〕＋追问 | scale_1_7＋text | 始终 |
| Q4 | 小岔子〔N−〕 | scale_1_7 | 始终 |
| Q5 | 真麻烦〔N+〕＋追问 | scale_1_7＋text | 始终 |
| Q6 | 深入状态＋追问①事/程度 ②展示 | scale_1_7＋text×2 | 始终 |
| Q7 | 帮人解决问题〔A+〕＋追问 | scale_1_7＋text | 始终 |
| Q8 | 兴趣转译 | multi_code A–G | 始终 |
| Q10 | 新概念〔O+〕＋追问 | scale_1_7＋text | 始终 |
| Q11 | 数据核对〔C+双〕＋追问 | scale_1_7＋text | 始终 |
| Q12 | 开放分析 | scale_1_7 | 始终 |
| Q13 | 实操组装＋追问 | scale_1_7＋text | 始终 |
| Q14 | 环境约束 | multi_code A–H | 始终 |
| Q15 | 能量账本 | multi_code ×2（A1–A7 / B1–B7） | 始终 |
| Q16 | 团体聚餐〔E−〕 | scale_1_7 | 始终 |
| Q18 | 高光或转折（CIT）＋追问 | scale_1_7＋text | 始终 |
| Q19 | 争论刺人〔A−〕 | scale_1_7 | 始终 |
| Q20 | 二选一＋追问 | scale_1_7＋text | 始终 |
| Q22 | 安慰低落〔A+〕 | scale_1_7 | 始终 |
| Q26 | 睡前反思〔O+〕＋追问 | scale_1_7＋text | 始终 |
| J1 | 主经历登记（title/organization/起止/时长） | structured_text×4 | B7 ∈ {A,B} |
| J2 | 主经历内容（tasks/tools/results＋其他经历追问） | structured_text×3＋text | B7 ∈ {A,B} |
| J3 | 技能清单（技能：水平；近期是否用过） | structured_text | B7 ∈ {A,B} |
| J4 | 语言与证书 | structured_text×2 | B7 ∈ {A,B} |
| J5 | 地点与办公方式（城市/优先/可接受/搬迁/通勤/办公多选/出差） | mixed | B7 ∈ {A,B} |
| J6 | 求职状态与类型（职级/类型/到岗/时长/自由职业/稳定性） | mixed | B7 ∈ {A,B} |
| J7 | 薪资期望（最低/期望/可议） | structured_text×3 | B7 ∈ {A,B} |
| J8 | 行业偏好（偏好/可接受/排除/外包/派遣） | mixed | B7 ∈ {A,B} |
| J9 | 核对与授权（3 勾选＋硬限制补充） | checkbox×3＋text | B7 ∈ {A,B} |
| QX.q | 提问项（每题一条，全局渲染） | text | 始终 |

总题量 35（B7 选 C 时典型作答 26 题）。

---

## 三、profile_status 与 consent

### 3.1 profile_status

| 字段 | 枚举/规则 |
|---|---|
| completion_level | `strong`（心理层＋补充页均完成）/ `psychological_only`（B7=C）/ `partial`（有出口/跳过） |
| job_matching_ready | 判定规则见《智能-问卷4.0评分说明》8.1；false 时 `recommended_occupations` 为空数组 |
| confidence | `high` / `medium` / `low`：由 exit_ratio、B 轨证据量、对偶校验结果合成 |
| missing_critical_fields[] | 字段全路径列表（如 `"job_search_profile.compensation.minimum_amount"`），仅列关键项 |
| warnings[] | 不阻断交付的提示（薪资自述需核验、某能力缺工作场景证据等） |

### 3.2 consent（J9 映射）

| 字段 | 来源 | 默认 |
|---|---|---|
| can_use_for_job_matching | J9-① | false |
| can_use_for_web_job_search | J9-② | false |
| can_generate_external_materials | 画像页显式开启 | false |
| can_share_sensitive_information_externally | 画像页显式开启 | false |
| behavior_inference_enabled | 画像页显式开启（行为推断类能力单独授权） | false |
| sensitive_info_requires_confirmation | J9-③（勾选 = true） | true |

## 四、basic_info（7 字段）

| 字段 | 来源 | 说明 |
|---|---|---|
| age_band | B1 | A–F |
| education_level | B2 | 枚举 `below_high_school / high_school / associate / bachelor / master_plus / enrolled / self_taught / unknown`（样板值如 "bachelor"） |
| experience_types | B3 | 枚举数组 `full_time / internship / part_time / freelance / personal_project / course_project / none` |
| primary_experience | B4 | B3 单选时自动等于该项 |
| experience_domain | B5 | 八类领域（样板值如 "data_analysis"） |
| experience_distress_attribution | B6.f1 解析 | task / environment / mixed / unknown；C 轨"同类不同岗"唯一判据（样板未列，为评分必需的扩展字段） |
| zero_experience | B3 派生 | boolean |

## 五、user_work_profile（Work DNA 八组）

### 5.1 capabilities[]（11 词表 + 自填）

词表与 3.0 相同：`independent_deep_work / detail_detection / self_learning / rule_based_tasks / delivery_for_others / process_execution / structured_problem_solving / visual_spatial / hands_on / verbal_expression / user_defined_*`。取值规则不变：定向分＋证据合成，高分无证据 → `medium`＋confidence=`self_report`＋进 unverified_clues。来源题号按 4.0 更新（Q6/Q7/Q8/Q10/Q11/Q12/Q13/Q18/B5）。

### 5.2 task_preference（5）

`creation / analysis / repetitive_precision / hands_on_build / client_negotiation` —— 来源 Q15-A1、Q12、Q11、Q13、Q3＋Q16，线性映射不变。

### 5.3 cognitive_style（5）

`deep_focus / context_switching_tolerance / ambiguity_tolerance / need_for_clear_requirements / planning_orderliness` —— `planning_orderliness` 来源改为 **Q1＋Q11**（Q2、Q9 已删）；其余不变（Q6 / Q15-B3＋Q14-B / Q12＋Q14-D＋Q15-B4 / Q14-D＋Q8-D）。

### 5.4 communication（4）

`async_text / small_team / frequent_meetings / client_facing` —— 来源 Q3＋Q14-C / Q7＋Q22 / Q15-B1 / Q3＋Q16。**已删除 `online_initiative`（原 Q25 已删）。**

### 5.5 environment（5）

`noise_sensitivity / remote_preference / predictable_workspace / onboarding_support_needed / disclosure_choice` —— Q14 勾选直定，规则不变。

### 5.6 energy（12 + 自填）

词表与取值规则同 3.0（+++ ~ −−−）。

### 5.7 values（5）

`environment_over_income / autonomy / mastery / meaning_making(已删) / stability / top_criterion` —— **4.0 保留 5 项**：environment_over_income（Q20）、autonomy（Q14-G＋Q8-A）、mastery（Q10＋Q26）、stability（Q1＋Q20）、top_criterion（Q20 追问文本解析）。**已删除 `meaning_making`（原 Q21 已删）。**

### 5.8 constraints[]（升级为 5 属性结构）

```json
{ "constraint_id": "CON-001", "label": "不接受长期高频出差",
  "scope": "travel",              // travel / work_mode / job_content / location / compensation / disclosure / other
  "constraint_level": "hard",     // hard / preference / soft
  "negotiability": "non_negotiable",  // negotiable / non_negotiable
  "source_question_ids": ["Q14-H", "J5"], "user_status": "accepted" }
```

词表：remote_preferred（Q14-G＋J5）、quiet_env（Q14-A）、no_frequent_switching（Q14-B＋Q15-B3）、no_client_facing（Q3＋Q16＋J9 补充）、no_heavy_travel（J5 出差）、commute_limit（J5 通勤上限）、disclosure_hr_only（Q14-F）、user_defined_*（Q14-H / J9 补充文本）。硬过滤时只消费 `constraint_level=hard` 的条目。

## 六、big5_scores（A 轨 · 11 题）

| 维度 | 题项 | 分数范围 |
|---|---|---|
| E | Q3、Q16r、（原 Q25 已删）→ **[Q3, Q16r]** | 2–14 |
| A | Q7、Q19r、Q22 | 3–21 |
| C | **[Q1, Q11]**（原 Q2、Q9r 已删） | 2–14 |
| N | **[Q4r, Q5]**（原 Q24r 已删） | 2–14 |
| O | **[Q10, Q26]**（原 Q23 已删） | 2–14 |

每维含 `raw / norm / items / reliability / source_question_ids`。reliability 枚举：`ok / inconsistent_pair_Qx_Qy / low_confidence / no_reverse_check`（C、O 结构性无反向题）。职业匹配前的 N 翻转规则见附录 A。

## 七、intelligence_profile（D 轨）

八项键：`linguistic / logical_mathematical / spatial / bodily_kinesthetic / musical / interpersonal / intrapersonal / naturalistic`＋`top_list`。每项 `verdict / D_q / D_e / source_question_ids / evidence_unit_ids`。4.0 题号映射：

| 智能 | 定向题 |
|---|---|
| linguistic | Q6、Q12 |
| logical_mathematical | Q10、Q11、Q12 |
| spatial | Q13（＋文本证据） |
| bodily_kinesthetic | Q13、B5-D |
| musical | 无（仅文本证据） |
| interpersonal | Q3、Q7、Q19r、Q22（原 Q25 已删） |
| intrapersonal | Q18（合并题，含"重来会改什么"）、Q20、Q26（原 Q17、Q21 已删/并入） |
| naturalistic | 无（Q6 兴趣文本线索） |

## 八、direction_scores[]（3 方向）

每条：`direction_id / label / scenario_score / evidence_score / background_adjustment / total / verdict / basis[] / source_question_ids / evidence_unit_ids / confidence / user_status`（后四项为样板新增的溯源属性）。direction_id：`data_qa_doc / research_analysis / hands_on_tech`。

## 九、job_search_profile（资格事实层 · 新增）

> 本层全部来自 B7、J1–J9、B2 追问及少量派生计算；**未知即 null / 空数组，禁止猜测**。

**J1/J2 录入辅助机制（回显卡片＋预填草稿，不改变数据契约）**：

- **回显卡片**：J1/J2 渲染时回显 B4（经历类型）、B5（领域）、B6.f3（一句话描述），供用户确认或就地修改；修改写回对应 basic_info 字段并触发重算。设计意图：用户不需要记住第零部分的选择，"系统记、用户确认"。
- **预填草稿**：系统从用户自己写过的作答文本（B6.f3、Q6.f1/f2、Q18 追问）解析 J1/J2 的候选值（title / duration_months / tasks / tools / results 等），以"待确认草稿"呈现；**仅经用户确认后才写入正式字段**（source 仍记 `user_reported`），未确认的草稿不入库、对应字段保持 null。
- **红线**：草稿只能来自该用户自己的作答原文；禁止用默认值、行业常识、外部数据生成草稿。本机制是录入辅助，不新增字段、不新增枚举，与样板契约兼容。

### 9.1 education（B2＋追问）

`highest_level`（枚举同 education_level）/ `major`（文本）/ `major_category`（从 major 归类，归不进标准类目时 null）/ `status`（`enrolled / graduated / dropped_out / self_taught / unknown`）/ `graduation_year`（int|null）/ `is_fresh_graduate`（毕业年 ∈ 当前年 ±1 且 formal_work_months < 12）/ `degree_obtained`（status=graduated 且 level ≥ associate）/ `school_name`（默认 null，不主动收集）。

### 9.2 experience_summary（派生）

`formal_work_months / internship_months / relevant_experience_months / project_count` —— 由 experiences[] 累加（type=full_time/part_time 计 formal；internship 计 internship；relevant = 与推荐方向 domain 相同的各段之和）；source=`calculated_from_experiences`。

### 9.3 experiences[]（J1＋J2，其他经历在 J2 追问中逐行登记）

每条 12 属性：`experience_id（EXP-###）/ type（full_time / internship / part_time / freelance / course_project / personal_project）/ title / organization / domain（八类枚举）/ start_date（YYYY-MM|null）/ end_date / duration_months（int，"至今"按当前月折算）/ tasks[] / tools[] / results[] / independence（independent / partly_independent / supervised / unknown，由 J2 结果的可验证程度推断，推断不出为 unknown）`＋三元属性。

### 9.4 skills[]（J3 为主，J2 工具回填）

每条：`skill_id（SKILL-###）/ name（用户原词）/ normalized_name（标准化名，如 Microsoft Excel）/ category（technical / tool / domain / language / motor）/ level（basic=1 / working=2 / advanced=3）/ last_used_at（YYYY-MM|null）/ evidence[]（来自 J2 结果或 Q6/Q18 追问）/ evidence_unit_ids[]`＋三元属性。J2 的 tools 自动生成 `level=working` 的候选条目，与 J3 冲突时以 J3 显式自评为准。

### 9.5 portfolio[]（J2/Q6 追问产物登记）

每条：`portfolio_id（PORT-###）/ title / type（course_project / personal_project / work / quest）/ description / skills[] / artifact_url（null，用户未提供链接时）/ shareable（默认 true，含敏感信息时 false）/ result`＋三元属性。来源：Q6 追问①②（作品/展示）、J2 results、Quest 完成记录。

### 9.6 languages[]（J4）

每条：`language / listening / speaking / reading / writing（native / fluent / working / basic / unknown 四技能分列，问卷只采总评时四项同值）/ certification / work_usable`。普通话默认一条 native（可关）。

### 9.7 location_preferences（J5）

`current_country_or_region（默认"中国大陆"，可改）/ current_city / preferred_cities[] / acceptable_cities[] / relocation（yes / maybe / no）/ acceptable_work_modes[]（onsite / hybrid / remote）/ maximum_one_way_commute_minutes（int|null）/ travel_acceptance（none / occasional / frequent）`。

### 9.8 employment_preferences（J6）

`career_stage（fresh_graduate / entry_level / experienced / career_change / unknown，由 B1＋B3＋graduation_year 派生）/ target_seniority[]（intern / entry_level / mid_level / any）/ employment_types[]（full_time / part_time / internship / freelance / campus_recruitment）/ available_from（YYYY-MM-DD|null）/ weekly_availability_hours（int|null）/ freelance_acceptable / unstable_workload_acceptable`。

### 9.9 compensation（J7）

`minimum_amount / expected_amount（int|null）/ period（默认 monthly）/ currency（默认 CNY）/ before_tax（默认 true）/ negotiable`。自述值进 `profile_status.warnings`（"需结合目标城市行情核验"）。

### 9.10 eligibility（J4＋默认）

`certifications[] / licenses[]（J4 解析）/ work_authorization（authorized_in_mainland_china 为默认；用户未确认时 unknown）/ visa_sponsorship_required（默认 false）/ other_eligibility_constraints[]（J9 补充文本解析）`。

### 9.11 industry_preferences（J8）

`preferred[] / acceptable[] / excluded[]（文本数组，不做强制词表）/ outsourcing_acceptable / labor_dispatch_acceptable`。

## 十、occupation_match 与 recommended_occupations

### 10.1 occupation_match[]（全量排序，规则见附录 A）

每条 14 属性：`occupation_id / name / match_score / verdict / big5_match / intelligence_match_norm / matched_dimensions / conflict_dimensions / skipped_dimensions[]（dim＋reason）/ matched_intelligences[] / env_demotions[]（环境冲突降级原因）/ confidence / basis[] / user_status`。

### 10.2 recommended_occupations[]（恰好 5 条或空数组）

生成规则见《智能-问卷4.0评分说明》8.2（硬过滤 → 降序取 5 → 不足按序松绑并记 warnings）。每条 16 属性：

```json
{
  "rank": 1, "occupation_id": "OCC-0641", "occupation_name": "QA/测试工程师/试验工程师",
  "recommendation_type": "career_fit_direction",
  "match_score": 0.76, "confidence": "both_tracks", "user_status": "accepted",
  "reason": ["排错和细节识别能力匹配", "喜欢规则明确和可验证结果的任务"],
  "search_titles": ["初级软件测试工程师", "功能测试工程师", "测试助理", "QA工程师"],
  "search_keywords": ["功能测试", "测试用例", "缺陷管理", "应届"],
  "negative_keywords": ["电话销售", "地推"],
  "current_readiness": "exploration_only",
  "matched_readiness_information": ["排错能力", "细节校验能力"],
  "missing_readiness_information": ["没有软件测试项目证据", "未确认测试工具技能"]
}
```

- `recommendation_type` 固定 `career_fit_direction`（方向型推荐；预留 `specific_jd_match`）。
- `current_readiness` 三档：`ready / partially_ready / exploration_only`。
- `search_titles / search_keywords` 由职业名＋用户 skills∪tools 交并生成；`negative_keywords` 由 constraints 翻译。
- **`job_matching_ready=false` 时本数组必须为空数组，同时 `missing_critical_fields` 列明缺失项。**

## 十一、evidence_units 与 unverified_clues

### 11.1 evidence_units[]（每条 8 属性，与样板一致）

`eu_id（EU-###）/ source_question_id（单值；Skill 对话来源记 skill_dialog）/ text / strength（1–3）/ parsed{situation, behavior, result} / linked_capabilities[] / linked_intelligences[] / user_status`。J1/J2 结构化经历除入库 experiences 外，J2"可验证结果"同步生成 EU（通常 3 级）。

### 11.2 unverified_clues[]

`clue / reason / source_question_ids`。A/B 冲突降级线索与能力词表 11 项中"待验证"条目均落此处。

## 十二、handoff 与 meta

### 12.1 handoff（下游消费契约）

```json
"handoff": {
  "consumer": "real_job_matching_module",
  "allowed_uses": ["生成检索词", "检索公开招聘信息", "执行硬条件过滤", "计算岗位匹配", "生成能力差距说明"],
  "required_processing_rules": [
    "先检查 consent.can_use_for_web_job_search",
    "未知信息不能按满足处理",
    "硬约束冲突时淘汰岗位",
    "职业方向匹配分不能替代真实JD资格核验",
    "所有真实岗位必须保留原始URL和检索时间"
  ]
}
```

### 12.2 meta（12 属性）

`answered / total_shown / exit_ratio / low_confidence_overall / trauma_guard_triggered / first_clue_delivered / recompute_trigger（questionnaire_completed | profile_edit | job_search_profile_completed）/ generator（=intelligent-questionnaire-4.0）/ data_quality_checks{valid_json, five_occupations_present, critical_job_search_fields_complete, user_confirmation_complete}`。交付前四项检查必须全部 true（`job_matching_ready=false` 时 `five_occupations_present` 与 `critical_job_search_fields_complete` 按"预期为空/不完整"规则放行，具体见评分说明 8.1/8.2）。

## 十三、问卷 × Skill × 前端联动（4.0）

1. **问卷→画像**：答完（或分段答完）按本文件计算全部字段，输出 output1.v1.0 JSON——前端画像页唯一数据源，Skill 只读输入。
2. **Skill 补全**：发现 null/unknown 字段（含 J 页跳过项）用原题干对话式追问，写回原字段并触发重算；Skill 不发明新字段、不猜测、不绕过出口项。对话中用户主动给出的经历按 EU 入库（source_question_id=`skill_dialog`）。
3. **补充页补答**：B7 选 C 的用户画像页提供"开始真实岗位匹配"入口 → 解锁 J1–J9（同样带回显卡片与预填草稿）→ `job_matching_ready` 重判 → 触发 recommended_occupations 生成。
4. **用户修正回路**：所有字段可"认可/修正/拒绝"；背景与 J 页字段修正 → 仅重算 job_search_profile、occupation_match 硬过滤与 recommended_occupations；心理层字段修正 → 连动重算 A/B/D 轨。被拒条目进观察池。
5. **推荐消费**：real_job_matching_module 按 handoff 契约消费——consent 检查 → constraints(hard) 全量过滤 → recommended_occupations 的 search_keywords/negative_keywords 检索 → 真实 JD 资格核验 → 保留原始 URL 与检索时间。

---

## 附录 A：职业匹配规则（沿用 3.0 第十一章，题号更新）

**数据源**：`occupation.json`（643 职业，canonical 标签体系）。

- **规范标签注册表**：E/N/C/A/O × _HIGH/_LOW 十标签；旧单字母码全链路禁用。
- **用户立场**：`neuroticism_norm = 1 − N.norm`（唯一翻转点），≥0.6 high / ≤0.4 low / 中间 neutral；reliability 门控：`low_confidence`、`inconsistent_pair_*` → excluded（后者触发复核），`no_reverse_check` 正常参与。
- **职业立场**：big5_state = high / low / both / none；both（矛盾标签，全库 358/643）与 none 退出分母，不裁决。
- **大五匹配分**：一致 +1×w、相反 −1×w（w=|2×norm−1|），`big5_match = Σ(score×w)/Σw`；有效维 <2 → null → 降级智能单轨。
- **智能匹配分**：strength 交集每项 +2（命中职业 top1 再 +0.5）、potential +1、undeterminable 不参与；/7 封顶。
- **补标标签消费（occupation.json schema 1.1）**：每个职业带 `environment_tags`（noise / interruption / communication_mode / rule_clarity / remote_feasibility / travel_level 六维枚举）、`typical_seniority`（entry_friendly / entry_possible / experienced_required）、`credential_required`（none / medical_license / law_license / teaching_cert / cpa_professional / driver_license / vocational_cert / other_professional）。消费规则：
  - **环境冲突降级**：用户硬约束（安静 vs 噪音高、不被打断 vs 打断频繁、远程必要 vs 远程可行性低）每命中一条，该职业 verdict 降一级（recommend→worth_exploring→hold），冲突写入 `env_demotions` 与 basis；
  - **硬否决（永不松绑）**：①"避免客户/销售"硬约束 vs 人际智能为首要标签；②不接受频繁出差 vs travel_level=frequent；③资格未确认——medical_license / law_license / cpa_professional / other_professional / teaching_cert / driver_license 与画像 eligibility 文本无匹配即否决（未知按不满足处理）；vocational_cert 过于宽泛，仅提示不否决；
  - **职级过滤（可松绑）**：experienced_required 职业，对 career_stage ∈ {fresh_graduate, entry_level} 或相关经验 <12 个月的用户暂缓进入推荐池；松绑顺序 = verdict 门槛 → 职级过滤，被松绑录入的条目 current_readiness 强制 exploration_only 并注明；
  - **非职业条目排除**：源库中"职业学生/家庭主妇/独裁者"等状态类或虚构条目不进推荐池（保留在 occupation_match）；
  - **同分破平**：match_score 并列时优先职业名与用户经历/技能/专业文本有双字词重叠者，再按智能分——不改变分数，只定同分次序。
- **合成分**：双轨 `0.5×(big5_match+1)/2 + 0.5×intelligence_match_norm`；verdict 阈值 recommend ≥0.70 / worth_exploring 0.45–0.70 / hold <0.45。
- **红线**：intelligence_only / reference_only 不得作为最终推荐结论；一切条目可溯源、可修正。

## 附录 B：与样板 output1.sample.json 的差异说明

结构、键名、枚举与样板完全一致。两处受控扩展（样板为演示数据，未展示全量规则字段）：

1. `basic_info.experience_distress_attribution`：C 轨"同类不同岗"判据，B6.f1 解析，评分必需；
2. 附录 A 的匹配规则字段（skipped_dimensions 等）在样板 occupation_match 中已出现，此处补全了 reason 枚举。

无删减样板任何键；关键字段缺失时一律 null / unknown / 空数组。
