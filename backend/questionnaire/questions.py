from __future__ import annotations

from typing import Any


def option(value: str, label: str) -> dict[str, str]:
    return {"value": value, "label": label}


def field(
    key: str,
    label: str,
    field_type: str,
    *,
    options: list[dict[str, str]] | None = None,
    placeholder: str | None = None,
    required: bool = False,
    minimum: int | None = None,
    maximum: int | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "key": key,
        "label": label,
        "type": field_type,
        "required": required,
    }
    if options is not None:
        result["options"] = options
    if placeholder:
        result["placeholder"] = placeholder
    if minimum is not None:
        result["min"] = minimum
    if maximum is not None:
        result["max"] = maximum
    return result


def scale(key: str = "value") -> dict[str, Any]:
    return field(key, "你的感受", "scale", minimum=1, maximum=7)


def question(
    question_id: str,
    section: str,
    title: str,
    prompt: str,
    fields: list[dict[str, Any]],
    *,
    condition: dict[str, Any] | None = None,
    note: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "id": question_id,
        "section": section,
        "title": title,
        "prompt": prompt,
        "fields": fields,
        "allow_skip": True,
    }
    if condition:
        result["condition"] = condition
    if note:
        result["note"] = note
    return result


AGE = [
    option("under_18", "18 岁以下"), option("18_24", "18–24 岁"),
    option("25_30", "25–30 岁"), option("31_40", "31–40 岁"),
    option("over_40", "40 岁以上"), option("unknown", "不想说"),
]
EDUCATION = [
    option("below_high_school", "初中及以下"), option("high_school", "高中/中专/职高"),
    option("associate", "大专"), option("bachelor", "本科"),
    option("master_plus", "硕士及以上"), option("enrolled", "仍在读"),
    option("self_taught", "主要靠自学"), option("unknown", "不想说 / 无法代表我"),
]
EXPERIENCE = [
    option("full_time", "全职工作"), option("internship", "实习"),
    option("part_time", "兼职/零工"), option("freelance", "自由职业/接单"),
    option("personal_project", "长期项目或爱好"), option("none", "以上都没有"),
    option("unknown", "不想说"),
]
DOMAIN = [
    option("data_admin", "文书/数据/资料整理"), option("technology", "技术/工程/IT"),
    option("service", "服务/面向顾客"), option("hands_on", "手工/操作/维修"),
    option("creative", "创作/内容"), option("research", "研究/分析"),
    option("management", "管理/协调/带人"), option("unknown", "不想说"),
]

SECTIONS = [
    {"id": "background", "title": "开始之前", "description": "背景信息只用于调整建议，不参与人格计分。"},
    {"id": "morning", "title": "清晨 · 日常底色", "description": "请回答当下真实状态，不是理想中的自己。"},
    {"id": "ability", "title": "上午 · 兴趣与能力", "description": "具体经历比自我评价更重要。"},
    {"id": "environment", "title": "中午 · 任务与环境", "description": "识别适合长期工作的任务结构和环境。"},
    {"id": "evidence", "title": "傍晚 · 经历证据", "description": "所有问题都可跳过，不愿回顾不会扣分。"},
    {"id": "values", "title": "夜晚 · 价值与反思", "description": "没有标准答案，只记录你的真实取舍。"},
    {"id": "job", "title": "求职补充页", "description": "只收集事实；未知信息不会被系统猜测。"},
]

QUESTIONS = [
    question("B1", "background", "你正走在人生的哪一段", "选择最接近的年龄阶段。", [field("value", "年龄阶段", "single", options=AGE)]),
    question("B2", "background", "你和上学走到了哪一步", "学历、专业和毕业年份将用于求职资格核对。", [
        field("value", "最高教育阶段", "single", options=EDUCATION),
        field("major", "专业（选填）", "text", placeholder="如：统计学"),
        field("graduation_year", "毕业或预计毕业年份", "number", minimum=1950, maximum=2100),
    ]),
    question("B3", "background", "你有过哪些真实经历", "正式工作、项目、爱好都算。", [field("value", "经历类型", "multi", options=EXPERIENCE)]),
    question("B4", "background", "最想讲哪一段经历", "后续经历问题只针对这一段。", [field("value", "主要经历", "single", options=EXPERIENCE[:5])], condition={"question": "B3", "operator": "experience_count_gte", "value": 2}),
    question("B5", "background", "这段经历属于哪一类", "选择最接近的领域。", [field("value", "经历领域", "single", options=DOMAIN)], condition={"question": "B3", "operator": "has_experience"}),
    question("B6", "background", "回头看这段经历", "1=想到再做就想回避；7=整体适合，愿意继续。", [
        scale(), field("attribution", "最难受的是任务本身还是环境", "single", options=[option("task", "任务本身"), option("environment", "环境/人际/噪音/规则"), option("mixed", "两者都有"), option("unknown", "说不清")]),
        field("liked", "最不排斥或有点喜欢的部分", "text"), field("summary", "做了什么、做了多久", "textarea"),
    ], condition={"question": "B3", "operator": "has_experience"}),
    question("B7", "background", "你现在的求职状态", "正在找或三个月内打算找时，会显示求职事实补充页。", [field("value", "求职状态", "single", options=[option("active", "正在找工作"), option("soon", "近三个月内打算找"), option("not_now", "暂时不找")])]),
    question("Q1", "morning", "闹钟响起的半小时", "没有固定安排时，我仍会按惯常顺序开始一天。1=每天顺序不同；7=有稳定顺序，被打乱会明显不适。", [scale()]),
    question("Q3", "morning", "和陌生人打交道", "必须回复陌生人的消息或当面办事时，我比较自在。1=很难回应；7=几分钟处理好且不消耗。", [scale(), field("detail", "哪类场合最难，哪类还好", "textarea")]),
    question("Q4", "morning", "出门前的小岔子", "东西找不到或计划被打乱时，我容易烦躁，半天缓不过来。1=几乎不受影响；7=会毁掉半天心情。", [scale()]),
    question("Q5", "morning", "遇到真正的麻烦", "遇到坏消息或事情失败时，我能放松并就事论事处理。1=情绪先于处理；7=能冷静处理。", [scale(), field("detail", "最近一次麻烦，以及你先做了什么", "textarea")]),
    question("Q6", "ability", "进入深入状态", "做感兴趣的事时，我会长时间专注。1=没有能投入几小时的事；7=经常投入三小时以上。", [
        scale(), field("activity", "这件事是什么", "text"), field("result", "做到什么程度、有什么成果", "textarea"), field("feedback", "是否给人看过、对方如何反馈", "textarea"),
    ], note="核心证据题：只写真实发生过的事。"),
    question("Q7", "ability", "帮别人解决问题", "有人带着擅长范围内的问题来问我时，我愿意并通常能帮他解决。", [
        scale(), field("situation", "最近一次被请教的问题", "text"), field("behavior", "你怎么解决", "textarea"), field("result", "最后结果或对方反馈", "textarea"),
    ], note="核心证据题。"),
    question("Q8", "ability", "兴趣转译成能力", "选择做 Q6 那件事时真实出现过的状态。", [field("value", "能力线索", "multi", options=[
        option("independent_deep_work", "长时间独自工作"), option("detail_detection", "反复核对细节"), option("self_learning", "自己查资料和摸索"), option("rule_based_tasks", "有明确成败标准"), option("delivery_for_others", "产出给别人使用"), option("process_execution", "按固定流程执行"),
    ]), field("other", "其他能力线索", "text")]),
    question("Q10", "ability", "遇到一个新概念", "遇到抽象新概念时，我有兴趣把它弄懂。1=只想知道怎么做；7=会一路查下去。", [scale(), field("detail", "最近弄懂的一个概念", "textarea")]),
    question("Q11", "environment", "数据 / 质检 / 文档任务", "独自核对 2000 行表格、规则清晰且无需讨论，这类任务对我可承受甚至舒适。", [scale(), field("detail", "做过最接近的事", "textarea")]),
    question("Q12", "environment", "研究 / 分析 / 写作任务", "面对没有标准答案的开放问题，我能自己查资料、搭框架并写成分析。", [scale()]),
    question("Q13", "environment", "手工 / 技术 / 实操任务", "按图纸组装、维修实物或按文档配置系统，这类有明确结果的任务适合我。", [scale(), field("detail", "修好或做出来过什么", "textarea")]),
    question("Q14", "environment", "工位环境", "选择你的必须项或难以忍受项。", [field("value", "环境约束", "multi", options=[
        option("quiet_env", "基本安静 / 可戴耳机"), option("no_frequent_switching", "不能频繁被打断"), option("async_text", "书面沟通为主"), option("clear_rules", "规则和标准明确"), option("onboarding_support", "需要导师或流程文档"), option("disclosure_choice", "保留披露选择"), option("remote_preference", "偏好远程 / 减少通勤"),
    ]), field("other", "其他环境要求", "text")]),
    question("Q15", "environment", "能量账本", "分别选择明显给你充电和明显消耗你的任务。", [
        field("energizing", "给我充电", "multi", options=[option("creation", "做东西/创作"), option("research", "查资料/研究"), option("debugging", "调试纠错"), option("organizing", "整理归类"), option("solo_execution", "独自执行明确任务"), option("helping", "教别人/帮人解决")]),
        field("draining", "消耗我", "multi", options=[option("meetings", "开会/集体讨论"), option("calls", "临时电话/视频"), option("switching", "频繁切换"), option("ambiguity", "需求不明确"), option("social", "长时间社交"), option("noise", "嘈杂环境")]),
    ]),
    question("Q16", "environment", "团体聚餐", "一桌人聚餐时我话很多。1=是主要声音之一；7=几乎不说话，希望尽快结束。", [scale()]),
    question("Q18", "evidence", "你的高光或转折", "回想一件真正骄傲或改变你做决定方式的事。", [
        scale(), field("situation", "发生了什么", "textarea"), field("behavior", "你具体做了什么", "textarea"), field("result", "做成了什么或带来什么改变", "textarea"), field("reflection", "重来会保留和改变哪一步", "textarea"),
    ], note="全卷最重要的证据栏；不愿回顾可以跳过。"),
    question("Q19", "evidence", "争论时的措辞", "气氛变差时，我可能说出刺伤对方的话。1=再生气也注意措辞；7=经常事后才发现。", [scale()]),
    question("Q20", "values", "收入与环境的选择", "甲收入高但人际复杂、规则模糊；乙收入普通但安静明确。我会选乙。", [scale(), field("detail", "重大选择时排在第一位的标准", "textarea")]),
    question("Q22", "values", "面对身边人的低落", "我能让低落的人放松一些。1=不知道怎么做；7=这是别人承认的本事。", [scale()]),
    question("Q26", "values", "睡前反思", "我会主动花时间反思。1=几乎不反思；7=反思是日常。", [scale(), field("detail", "长期在琢磨的问题", "textarea")]),
    question("J1", "job", "主经历登记", "登记你最正式的一段工作、项目或长期爱好。", [
        field("type", "经历类型", "single", options=EXPERIENCE[:5]), field("title", "岗位或项目名称", "text"), field("organization", "单位/学校/平台", "text"), field("start_date", "开始时间", "month"), field("end_date", "结束时间（进行中可空）", "month"), field("duration_months", "总月数", "number", minimum=0, maximum=600), field("hours_per_week", "每周小时", "number", minimum=0, maximum=168),
    ], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J2", "job", "主经历内容", "只填写真实做过的任务、工具和可核验结果。", [
        field("tasks", "主要任务（每行一条）", "textarea"), field("tools", "工具/软件/设备（逗号分隔）", "text"), field("results", "可验证结果（每行一条）", "textarea"), field("other_experiences", "其他经历（选填）", "textarea"),
    ], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J3", "job", "技能清单", "每行一项，格式：技能名称：1/2/3。1=入门，2=常规任务，3=复杂任务。", [field("skills", "2–5 项谋生技能", "textarea", placeholder="SQL：3\nExcel：2")], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J4", "job", "语言与证书", "没有可以留空。", [field("languages", "语言及水平（每行一项）", "textarea"), field("certifications", "证书/执照（每行一项）", "textarea")], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J5", "job", "地点与办公方式", "记录真实可接受范围。", [
        field("current_city", "当前城市", "text"), field("preferred_cities", "优先城市（逗号分隔）", "text"), field("acceptable_cities", "可接受城市（逗号分隔）", "text"), field("relocation", "换城市意愿", "single", options=[option("yes", "愿意"), option("conditional", "看条件"), option("no", "不愿意")]), field("commute_minutes", "单程通勤上限（分钟）", "number", minimum=0, maximum=360), field("work_modes", "办公方式", "multi", options=[option("onsite", "到岗"), option("hybrid", "混合"), option("remote", "远程")]), field("travel", "出差接受度", "single", options=[option("none", "不接受"), option("occasional", "偶尔可以"), option("frequent", "经常也行")]),
    ], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J6", "job", "求职类型", "目标职级与雇佣方式是职业匹配关键事实。", [
        field("seniority", "目标职级", "multi", options=[option("intern", "实习"), option("entry_level", "应届/初级"), option("experienced", "有经验者"), option("any", "都可以")]), field("employment_types", "雇佣类型", "multi", options=[option("full_time", "全职"), option("part_time", "兼职"), option("internship", "实习"), option("freelance", "自由职业")]), field("available_date", "最早入职日期", "date"), field("hours_per_week", "每周可工作小时", "number", minimum=1, maximum=168), field("freelance_acceptable", "接受自由职业", "boolean"), field("variable_workload_acceptable", "接受工作量不稳定", "boolean"),
    ], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J7", "job", "薪资期望", "税前月薪，无法确定可以跳过。", [field("minimum_amount", "最低可接受月薪", "number", minimum=0), field("expected_amount", "期望月薪", "number", minimum=0), field("negotiable", "是否可谈", "boolean")], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J8", "job", "行业偏好", "偏好不作为硬条件，排除项会进入过滤。", [field("preferred", "偏好行业（逗号分隔）", "text"), field("acceptable", "可接受行业（逗号分隔）", "text"), field("excluded", "排除行业（逗号分隔）", "text"), field("outsourcing_acceptable", "接受外包", "boolean"), field("labor_dispatch_acceptable", "接受劳务派遣", "boolean")], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
    question("J9", "job", "核对与授权", "授权必须由你主动选择，默认关闭。", [field("can_use_for_job_matching", "允许使用画像进行岗位匹配", "boolean"), field("can_use_for_web_job_search", "允许检索公开招聘信息", "boolean"), field("sensitive_info_requires_confirmation", "敏感信息对外使用前需再次确认", "boolean"), field("hard_constraints", "其他硬限制", "textarea")], condition={"question": "B7", "operator": "in", "value": ["active", "soon"]}),
]

QUESTION_IDS = {item["id"] for item in QUESTIONS}

QUESTIONNAIRE_SCHEMA = {
    "schema_version": "questionnaire.v4",
    "output_schema_version": "output1.v1.0",
    "title": "《我的一天》职业探索问卷",
    "description": "回答当下真实状态；所有问题可跳过，系统不会猜测缺失信息。",
    "sections": SECTIONS,
    "questions": QUESTIONS,
    "question_count": len(QUESTIONS),
}
