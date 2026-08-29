(function () {
  "use strict";

  const opt = (value, label) => ({ value, label });
  const scale = (id, section, title, scene, statement, low, high, followups = [], exitLabel = "不了解 / 说不好") => ({
    id, section, title, scene, text: statement, type: "scale", low, high, followups, exitLabel,
    help: "请按你当下的日常状态回答。1 和 7 只是两端行为锚点，中间分数可以表示介于两者之间。"
  });

  const sections = [
    { id: "base", label: "天亮之前", note: "基础信息" },
    { id: "morning", label: "清晨", note: "日常底色" },
    { id: "forenoon", label: "上午", note: "兴趣与能力" },
    { id: "noon", label: "中午", note: "情境与环境" },
    { id: "evening", label: "傍晚", note: "经历淬炼" },
    { id: "night", label: "夜晚", note: "认知与价值" },
    { id: "job", label: "求职补充", note: "真实岗位匹配" }
  ];

  const questions = [
    {
      id: "B1", section: "base", title: "你正走在人生的哪一段", type: "single",
      text: "先了解你大概从哪条路走来。这不是为了贴标签，只是让后面的建议不飘在空中。",
      help: "年龄段只用来调整探索任务的难度，不会当作能力结论。",
      options: [opt("under_18", "18 岁以下"), opt("18_24", "18–24 岁"), opt("25_30", "25–30 岁"), opt("31_40", "31–40 岁"), opt("40_plus", "40 岁以上"), opt("unknown", "不想说")]
    },
    {
      id: "B2", section: "base", title: "你和“上学”走到了哪一步", type: "single",
      text: "选最接近你当前情况的一项。",
      help: "求学经历会用于真实岗位的资格筛选；不想说时将保留为未知，不会猜测。",
      options: [opt("below_high_school", "初中及以下"), opt("high_school", "高中 / 中专 / 职高"), opt("associate", "大专"), opt("bachelor", "本科"), opt("master_plus", "硕士及以上"), opt("enrolled", "仍在读"), opt("self_taught", "主要靠自学"), opt("unknown", "不想说 / 这一栏代表不了我")],
      followups: [
        { key: "major", label: "专业（选填）", placeholder: "例如：数字媒体技术" },
        { key: "graduation_year", label: "毕业或预计毕业年份（选填）", placeholder: "例如：2026", inputType: "number" }
      ]
    },
    {
      id: "B3", section: "base", title: "到目前为止，你有过这些经历吗", type: "multi",
      text: "不是问“正式简历”，任何一段真实经历都算数。",
      help: "可以多选。如果选“以上都没有”，后面会跳过工作经历追问，改从生活中找能力证据。",
      options: [opt("full_time", "全职工作"), opt("internship", "实习"), opt("part_time", "兼职 / 零工"), opt("freelance", "自由职业 / 接单"), opt("personal_project", "长期做过的项目或爱好"), opt("none", "以上都没有"), opt("unknown", "不想说")]
    },
    {
      id: "B4", section: "base", title: "这些经历里，你最想讲哪一段", type: "single", dynamicOptions: "B3",
      text: "后面关于“那段经历”的问题，都只针对你选的这一段。",
      help: "挑你印象最深、最想说的一段即可，不必挑看起来最正式的。", options: []
    },
    {
      id: "B5", section: "base", title: "这段经历主要属于哪一类", type: "single",
      text: "选择最接近主要任务的类型。",
      help: "这一题只用于建立经历背景，不会单独决定职业推荐。",
      options: [opt("data_document", "文书 / 数据 / 资料整理"), opt("technology", "技术 / 工程 / IT"), opt("service", "服务 / 面向顾客"), opt("hands_on", "手工 / 操作 / 维修"), opt("creative", "创作 / 内容"), opt("research", "研究 / 分析"), opt("management", "管理 / 协调 / 带人"), opt("unknown", "不想说")]
    },
    scale("B6", "base", "回头看这段经历", "想想你刚刚选定的那一段。", "整体来说，我愿意继续做类似的事。", "很难受，想到再做就想回避", "有辛苦，但整体适合我", [
      { key: "distress", label: "最难受的是事情本身，还是环境？", placeholder: "例如：事情本身不难，但一直被打断很累" },
      { key: "liked", label: "最不排斥、甚至有点喜欢的部分", placeholder: "写一句就可以" },
      { key: "summary", label: "一句话说明做了什么、做了多久", placeholder: "这句会在求职补充页回显" }
    ], "不愿回顾"),
    {
      id: "B7", section: "base", title: "你现在的求职状态", type: "single",
      text: "这会决定问卷最后是否出现真实岗位匹配补充页。",
      help: "选“暂时不找”仍然可以完成能力图谱，只是不会生成真实岗位推荐。",
      options: [opt("active", "正在找工作"), opt("soon", "近三个月内打算找"), opt("not_now", "暂时不找")]
    },

    scale("Q1", "morning", "闹钟响起的半小时", "早晨醒来，今天没有任何必须几点到的安排。", "我会按惯常的顺序开始这一天，而不是随当天心情临时安排。", "开始顺序几乎每天都不一样", "有一套很稳定的顺序"),
    scale("Q3", "morning", "和陌生人打交道", "上午，一个不太熟的人需要和你打交道。", "这种时候我比较自在。", "普通消息也会纠结很久", "线上线下都很自在", [{ key: "example", label: "哪类陌生人场合最难，哪类其实还好？", placeholder: "选填：写一个具体场合" }], "不了解 / 没经历过"),
    scale("Q4", "morning", "出门前的小岔子", "东西找不到、车晚点，或计划被打乱。", "我很容易因此烦躁，半天缓不过来。", "小岔子对我几乎没影响", "一点小岔子就会毁掉一上午"),
    scale("Q5", "morning", "早上遇到真正的麻烦", "东西坏了、事情黄了，或一醒来就收到坏消息。", "大部分时候我心态是放松的，能就事论事处理。", "一有麻烦就慌，情绪先于处理", "越有麻烦越冷静", [{ key: "example", label: "最近一次大麻烦是什么？你先做了什么？", placeholder: "选填：具体事情比分数更有用" }]),

    scale("Q6", "forenoon", "深入状态", "上午有整块自由时间，你手上有一件自己感兴趣的事。", "我会进入长时间的专注状态，一抬头几个小时过去了。", "目前没有能让我投入几小时的事", "经常一投入就是 3 小时以上", [
      { key: "work", label: "这件事是什么？你做到了什么程度？", placeholder: "作品、成果、水平都可以" },
      { key: "shown", label: "你把它给人看过吗？对方反应如何？", placeholder: "没有也完全没问题" }
    ], "不了解 / 想不起来"),
    scale("Q7", "forenoon", "帮别人解决问题", "有人带着一个具体问题来问你，正好在你擅长的范围内。", "我愿意为此抽出时间，帮对方彻底解决，并且通常能解决。", "通常回避，或经常没解决", "愿意调整时间，多数真能解决", [{ key: "example", label: "最近一次被请教是什么问题？你怎么解决的？", placeholder: "写下你的行动和结果" }], "不了解 / 没人问过我"),
    {
      id: "Q8", section: "forenoon", title: "把兴趣翻译成能力", type: "multi",
      text: "把你在上一题想到的事讲给一个完全外行听。哪几项符合你做这件事时的状态？",
      help: "可以多选。每一项只会记为一条待验证线索，不会仅凭勾选就当作已证实的能力。",
      options: [opt("independent_deep_work", "需要长时间独自工作，不被打扰"), opt("detail_detection", "需要反复核对细节、发现错误"), opt("self_learning", "需要自己查资料、看教程摸索"), opt("rule_based_tasks", "有明确的对错或成败标准"), opt("delivery_for_others", "产出是给别人用的"), opt("process_execution", "需要按固定流程一步步做"), opt("other", "其他")],
      followups: [{ key: "other", label: "其他能力线索（选填）", placeholder: "用你自己的话写" }], exitLabel: "不了解 / 说不好"
    },
    scale("Q10", "forenoon", "一个新概念", "早上听到或读到一个抽象的新概念。", "我有兴趣把它弄懂。", "我只想知道“所以该怎么做”", "会顺着概念一路查下去", [{ key: "example", label: "最近弄懂的一个概念是什么？", placeholder: "选填" }]),

    scale("Q11", "noon", "数据 / 质检 / 文档方向", "你独自坐在安静的工位，按清晰规则检查一份 2000 行的表格。", "这种重复核对的任务对我而言可承受，甚至舒服。", "光是想象就坐不住", "越做越顺，进入状态后很平静", [{ key: "example", label: "你做过最接近的事是什么？", placeholder: "选填：这会是方向证据" }], "不了解 / 没做过类似的事"),
    scale("Q12", "noon", "研究 / 分析 / 写作方向", "你接到一个没有标准方法的开放问题，需要自己查资料、搭框架、写成分析。", "这种没有标准答案、要自己搭结构的任务我能做好。", "面对开放问题会大脑空白", "会自然拆解、列提纲、找证据"),
    scale("Q13", "noon", "手工 / 技术 / 实操方向", "你按图纸组装维修一个实物，或按文档配置一套系统。", "这种动手、有可见成果的任务适合我。", "不擅长也不喜欢动手操作", "做好或跑通时很有满足感", [{ key: "example", label: "你修好过或做出来过什么？", placeholder: "选填" }], "不了解 / 没做过"),
    {
      id: "Q14", section: "noon", title: "中午的工位环境", type: "multi",
      text: "回到真实工作环境本身。哪些是你的“必须项”或“难以忍受项”？",
      help: "可以多选。这些会作为岗位环境筛选线索；是硬限制还是偏好，后续仍需要你确认。",
      options: [opt("quiet_env", "必须基本安静 / 可戴耳机"), opt("no_frequent_switching", "不能忍受频繁被打断、切换任务"), opt("async_text", "希望书面沟通为主，少电话"), opt("clear_rules", "必须规则和标准明确"), opt("onboarding_support", "需要明确的入职支持"), opt("disclosure_hr_only", "不披露身份，或只对 HR 披露"), opt("remote_preferred", "偏好远程 / 减少通勤"), opt("other", "其他")],
      followups: [{ key: "other", label: "其他环境限制（选填）", placeholder: "例如：不能长时间久站" }], exitLabel: "不了解"
    },
    {
      id: "Q15", section: "noon", title: "能量账本", type: "form",
      text: "一天下来，有些事让你回血，有些事把你掏空。请分别勾选。",
      help: "两组都可以多选，没有必须选满的数量。",
      fields: [
        { key: "recharge", label: "明显给我充电 +++", kind: "multi", options: [opt("creation", "做东西 / 创作"), opt("research", "查资料 / 研究"), opt("debug", "调试、纠错、找茬"), opt("organize", "整理、归类、建体系"), opt("solo", "独自执行明确任务"), opt("help", "教别人 / 帮别人解决") ] },
        { key: "drain", label: "明显消耗我 −−−", kind: "multi", options: [opt("meetings", "开会、集体讨论"), opt("calls", "临时电话 / 视频通话"), opt("switching", "频繁切换任务"), opt("ambiguity", "面对不明确的需求"), opt("social", "长时间社交"), opt("noise", "嘈杂环境") ] },
        { key: "other", label: "还有其他充电或耗电的事吗（选填）", kind: "text", placeholder: "可以分别写一句" }
      ], exitLabel: "不了解 / 说不好"
    },
    scale("Q16", "noon", "中午的团体聚餐", "一桌人在一起吃饭。", "我在这种场合话很多。", "全程话多，是桌上主要的声音之一", "几乎不说话，只想尽快结束"),

    scale("Q18", "evening", "你的高光或转折", "回想一段你最愿意讲的历史：真正骄傲的时刻，或改变了你做决定方式的转折。", "我能清楚说出那件事里自己具体做成了什么，或它怎么改变了我。", "想不起能称得上骄傲或转折的时刻", "马上能想起来，并且能说清", [{ key: "story", label: "什么事？你做了什么？难在哪里？如果重来会保留和改掉什么？", placeholder: "这是全卷最重要的证据栏，想说多少都可以" }], "不愿回顾 / 想不起来"),
    scale("Q19", "evening", "傍晚的争论", "和人争论时气氛变差。", "我可能说出刺伤对方的话。", "从不这样，再生气也注意措辞", "经常脱口而出，事后才发现"),

    scale("Q20", "night", "二选一的深夜", "两份工作：甲收入高，但要长期应付复杂人际和模糊规则；乙收入普通，但环境安静、任务明确。", "我会选乙。", "选甲，收入和前途值得忍受环境", "毫不犹豫选乙，加钱也不换", [{ key: "criterion", label: "你做重大选择时，排在第一位的标准是什么？", placeholder: "如果需要更多信息，也写在这里" }], "需要更多信息"),
    scale("Q22", "night", "家人或室友的低落", "深夜，身边的人情绪低落。", "我能让身边低落的人放松一些。", "完全不知道该说什么，通常回避", "有办法让对方放松，这是别人承认的本事"),
    scale("Q26", "night", "睡前反思", "睡前独处。", "我会花时间思考、反思各种事情。", "几乎不主动反思", "反思是日常，有长期在琢磨的问题", [{ key: "topic", label: "你长期在琢磨的问题是什么？", placeholder: "选填" }]),

    {
      id: "J1", section: "job", title: "主经历登记", type: "form", recap: true,
      text: "登记你前面选定的那段经历。没有工作经历时，项目、爱好或自学也算。",
      help: "信息不确定就留空，系统不会代替你猜。",
      fields: [
        { key: "title", label: "岗位或项目名称", kind: "text", placeholder: "例如：社团活动数据整理" },
        { key: "organization", label: "单位 / 学校 / 平台", kind: "text", placeholder: "可模糊到“某电商公司”" },
        { key: "start_date", label: "开始时间", kind: "month" }, { key: "end_date", label: "结束时间（进行中可留空）", kind: "month" },
        { key: "duration_months", label: "约持续多少个月", kind: "number", placeholder: "例如：6" }, { key: "weekly_hours", label: "每周约投入多少小时", kind: "number", placeholder: "例如：10" }
      ]
    },
    {
      id: "J2", section: "job", title: "主经历内容", type: "form", recap: true,
      text: "只记录你真正做过的事。尽量用动词开头，结果能被别人看到或核对更好。",
      help: "前面写过的原话会在页面上回显，但不会自动写入正式字段。",
      fields: [
        { key: "tasks", label: "主要做了什么（1–3 条）", kind: "textarea", placeholder: "例如：整理销售数据；维护经营周报" },
        { key: "tools", label: "用过的工具 / 软件 / 设备", kind: "text", placeholder: "例如：Excel、SQL" },
        { key: "results", label: "可验证的结果", kind: "textarea", placeholder: "例如：完成 12 期周报；独立查出 30 处错误" },
        { key: "other_experiences", label: "还有其他工作 / 实习 / 项目吗（选填）", kind: "textarea", placeholder: "每段一行：名称＋起止＋一句话" }
      ]
    },
    {
      id: "J3", section: "job", title: "技能清单", type: "form",
      text: "列出你最有把握的 2–5 项谋生技能，软件、工具、手艺、语言都算。",
      help: "水平 3 = 能独立完成较复杂任务；2 = 能独立完成常规任务；1 = 入门，需要指导。",
      fields: [{ key: "skills", label: "技能：水平；近期是否用过", kind: "textarea", placeholder: "SQL：3，近期用过；Excel：3，近期用过；Python：1，半年未用" }]
    },
    {
      id: "J4", section: "job", title: "语言与证书", type: "form", text: "只填已经获得或可以核对的信息。", help: "没有就留空，未知不按“已具备”处理。",
      fields: [{ key: "languages", label: "普通话之外的语言及水平", kind: "text", placeholder: "例如：英语 CET-6、日语 N2" }, { key: "certifications", label: "证书 / 执照", kind: "text", placeholder: "例如：计算机等级、教资、驾照" }]
    },
    {
      id: "J5", section: "job", title: "地点与办公方式", type: "form", text: "这些字段用于真实 JD 的地点和工作方式过滤。", help: "当前城市是匹配就绪的必填字段；其他项不确定可留空。",
      fields: [
        { key: "current_city", label: "当前城市", kind: "text", placeholder: "例如：上海" }, { key: "preferred_cities", label: "优先城市（可多个）", kind: "text" }, { key: "acceptable_cities", label: "可接受城市", kind: "text" },
        { key: "relocation", label: "为合适的工作换城市", kind: "single", options: [opt("yes", "愿意"), opt("maybe", "看条件"), opt("no", "不愿意")] },
        { key: "commute", label: "单程通勤上限（分钟）", kind: "number", placeholder: "例如：60" },
        { key: "work_modes", label: "可接受的办公方式", kind: "multi", options: [opt("onsite", "到岗"), opt("hybrid", "混合"), opt("remote", "远程")] },
        { key: "travel", label: "出差接受度", kind: "single", options: [opt("none", "不接受"), opt("occasional", "偶尔可以"), opt("frequent", "经常也行") ] }
      ]
    },
    {
      id: "J6", section: "job", title: "求职类型", type: "form", text: "选择你当前真正会考虑的职级和雇佣方式。", help: "目标职级和雇佣类型是匹配就绪的必填字段。",
      fields: [
        { key: "seniority", label: "目标职级", kind: "multi", options: [opt("intern", "实习"), opt("entry_level", "应届 / 初级"), opt("mid_level", "有经验者"), opt("any", "都可以") ] },
        { key: "employment_types", label: "雇佣类型", kind: "multi", options: [opt("full_time", "全职"), opt("part_time", "兼职"), opt("internship", "实习"), opt("freelance", "自由职业接单") ] },
        { key: "available_from", label: "最早可入职时间", kind: "date" }, { key: "weekly_hours", label: "每周可工作小时数", kind: "number" },
        { key: "freelance_acceptable", label: "能否接受自由职业", kind: "single", options: [opt(true, "能"), opt(false, "不能")] },
        { key: "unstable_acceptable", label: "能否接受工作量不稳定", kind: "single", options: [opt(true, "能"), opt(false, "不能")] }
      ]
    },
    {
      id: "J7", section: "job", title: "薪资期望", type: "form", text: "请填税前月薪。这是个人自述，之后仍需与目标城市行情核对。", help: "最低可接受月薪是真实岗位匹配的必填字段，未知时不会替你填默认值。",
      fields: [{ key: "minimum", label: "最低可接受月薪（元）", kind: "number", placeholder: "例如：8000" }, { key: "expected", label: "期望月薪（元）", kind: "number", placeholder: "例如：10000" }, { key: "negotiable", label: "有商量余地吗", kind: "single", options: [opt(true, "可以谈"), opt(false, "很难让步") ] }]
    },
    {
      id: "J8", section: "job", title: "行业偏好", type: "form", text: "行业偏好只作为真实 JD 筛选条件，不会倒推你的人格或能力。", help: "可以留空。排除行业会作为检索负向关键词。",
      fields: [{ key: "preferred", label: "偏好行业", kind: "text", placeholder: "例如：互联网、电商、制造业" }, { key: "acceptable", label: "可接受行业", kind: "text" }, { key: "excluded", label: "排除行业", kind: "text" }, { key: "outsourcing", label: "能否接受外包岗位", kind: "single", options: [opt(true, "能"), opt(false, "不能")] }, { key: "dispatch", label: "能否接受劳务派遣", kind: "single", options: [opt(true, "能"), opt(false, "不能")] }]
    },
    {
      id: "J9", section: "job", title: "核对与授权", type: "form", text: "这些选项会决定你的信息可以被用在哪些下游任务中。", help: "默认不对外共享敏感信息。使用画像匹配岗位必须由你显式授权。",
      fields: [
        { key: "can_match", label: "允许使用我的画像信息进行岗位匹配", kind: "checkbox" },
        { key: "can_search", label: "允许检索公开招聘信息并为我生成检索词", kind: "checkbox" },
        { key: "confirm_sensitive", label: "敏感信息对外使用前，必须先经我确认", kind: "checkbox", defaultValue: true },
        { key: "hard_limits", label: "其他硬限制（选填）", kind: "textarea", placeholder: "例如：不能久站；每周三下午不可用" }
      ]
    }
  ];

  window.ISYOU_QUESTIONNAIRE_V4 = Object.freeze({ schemaVersion: "output1.v1.0", sections, questions });
})();
