const DIMENSION_LABELS = ["规则稳定", "独立作业", "书面沟通", "低感官负荷", "细节专注", "流程执行"];

const ANSWER_TEXTS = [
  ["我自己做完了，中途没找人", "我先自己做，卡住才找人", "我们分了工，各做各的那部分", "其他，我自己写"],
  ["我先停下来，问清楚新的步骤再动", "我照原来的做完，之后再改", "我很难继续，需要一段时间才能重新开始", "其他，我自己写"],
  ["没什么影响，我照常做完了", "我戴上耳机之后就还好", "我很难集中，做得比平时慢很多", "其他，我自己写"]
];

const JOB_DEFINITIONS = [
  {
    id: "data_annotation",
    occupationId: "ISYOU-DATA-ANNOTATION",
    title: "数据标注专员",
    meta: "远程 · 全职 · 科技公司",
    profile: [0.92, 0.82, 0.82, 0.88, 0.94, 0.93],
    task: "按照书面标注规范逐项处理数据，记录疑问并由固定负责人统一答复。",
    gap: "通常需要接受规则更新，并参加短时线上同步。",
    trainLabel: "培训「短会议参与」· 3 课时",
    searchTitles: ["数据标注专员", "数据审核专员", "AI 数据标注"],
    searchKeywords: ["数据标注", "数据校验", "质量检查"],
    blocks: [
      ["01 · TASK　任务结构", "规范明确，按批次处理", [["ok", "依据书面规范逐项标注"], ["ok", "异常情况需要记录并上报"], ["unknown", "规则更新频率需向企业确认"]]],
      ["02 · PLACE　工作环境", "远程岗位较常见", [["info", "部分岗位支持远程或混合办公"], ["unknown", "设备与打卡要求以招聘页为准"]]],
      ["03 · SENSORY　感官条件", "通常可自行控制环境", [["match", "远程时可降低持续噪声与现场干扰"], ["unknown", "现场培训安排需确认"]]],
      ["04 · TALK　沟通方式", "文字记录为主", [["info", "问题通常通过工单或群消息汇总"], ["warn", "可能有短时线上会议"]]]
    ]
  },
  {
    id: "library_cataloging",
    occupationId: "ISYOU-LIBRARY-CATALOGING",
    title: "图书馆编目助理",
    meta: "现场 · 固定工位 · 图书馆",
    profile: [0.96, 0.68, 0.48, 0.76, 0.92, 0.95],
    task: "依据固定分类规则录入、核对并维护馆藏信息，工作步骤重复且清楚。",
    gap: "现场岗位可能包含读者问询与同事交接。",
    trainLabel: "培训「简短问答应对」· 3 课时",
    searchTitles: ["图书馆编目助理", "图书资料管理员", "档案编目员"],
    searchKeywords: ["图书编目", "资料录入", "分类整理"],
    blocks: [
      ["01 · TASK　任务结构", "分类规则固定", [["ok", "按分类与著录规则维护书目信息"], ["ok", "需要持续核对字段准确性"]]],
      ["02 · PLACE　工作环境", "现场固定工位", [["info", "通常需要到馆工作"], ["unknown", "工位噪声与人流需现场确认"]]],
      ["03 · SENSORY　感官条件", "整体较稳定", [["info", "环境通常比开放办公区安静"], ["unknown", "读者高峰期的感官负荷未知"]]],
      ["04 · TALK　沟通方式", "包含固定场景问答", [["warn", "可能需要回应简单读者问询"], ["info", "内部交接通常有固定流程"]]]
    ]
  },
  {
    id: "quality_records",
    occupationId: "ISYOU-QUALITY-RECORDS",
    title: "质检记录员",
    meta: "现场 · 制造企业 · 固定流程",
    profile: [0.96, 0.76, 0.55, 0.28, 0.96, 0.98],
    task: "按照检查表逐项核对产品或记录，标记异常并生成质量记录。",
    gap: "部分岗位位于车间，可能有机器声或轮班要求。",
    trainLabel: "培训「高噪声环境准备」· 3 课时",
    searchTitles: ["质检记录员", "质量检验员", "数据质检专员"],
    searchKeywords: ["质量检查", "异常记录", "检查表"],
    blocks: [
      ["01 · TASK　任务结构", "检查项清晰", [["ok", "依据检查表逐项执行"], ["ok", "异常需要准确记录"]]],
      ["02 · PLACE　工作环境", "以现场岗位为主", [["info", "可能需要固定到岗"], ["unknown", "班次与加班安排需确认"]]],
      ["03 · SENSORY　感官条件", "可能存在机器声", [["warn", "车间岗位可能有持续噪声"], ["unknown", "是否提供防护用品需确认"]]],
      ["04 · TALK　沟通方式", "交接内容明确", [["info", "异常按固定流程交接"], ["unknown", "现场即时沟通频率未知"]]]
    ]
  },
  {
    id: "software_testing",
    occupationId: "ISYOU-SOFTWARE-QA",
    title: "软件测试执行",
    meta: "远程或混合 · 科技公司",
    profile: [0.78, 0.8, 0.88, 0.82, 0.94, 0.84],
    task: "按照测试用例执行功能检查，复现问题并用文字提交缺陷记录。",
    gap: "需求迭代会带来任务切换，缺陷也可能需要同步讨论。",
    trainLabel: "培训「书面同步问题」· 3 课时",
    searchTitles: ["初级软件测试工程师", "功能测试专员", "测试助理"],
    searchKeywords: ["测试执行", "缺陷复现", "测试用例"],
    blocks: [
      ["01 · TASK　任务结构", "用例驱动", [["ok", "依据测试用例执行并记录结果"], ["warn", "迭代期间任务可能变化"]]],
      ["02 · PLACE　工作环境", "远程与混合均有", [["info", "部分团队支持远程测试"], ["unknown", "具体到岗频率需确认"]]],
      ["03 · SENSORY　感官条件", "电脑工作为主", [["match", "通常可自行调节声音与光线"], ["unknown", "开放工位情况需确认"]]],
      ["04 · TALK　沟通方式", "文字缺陷单为主", [["ok", "问题可通过缺陷单结构化表达"], ["warn", "复杂缺陷可能需要临时同步"]]]
    ]
  },
  {
    id: "archive_digitization",
    occupationId: "ISYOU-ARCHIVE-DIGITIZATION",
    title: "档案数字化助理",
    meta: "现场 · 独立工位 · 档案机构",
    profile: [0.94, 0.88, 0.64, 0.86, 0.92, 0.97],
    task: "按批次完成扫描、命名、目录录入和质量复核，流程稳定且成果可核对。",
    gap: "通常需要到场，并与档案保管人员完成固定交接。",
    trainLabel: "培训「固定场景对话」· 3 课时",
    searchTitles: ["档案数字化助理", "档案扫描员", "档案录入员"],
    searchKeywords: ["档案数字化", "扫描录入", "资料整理"],
    blocks: [
      ["01 · TASK　任务结构", "按批次执行", [["ok", "扫描、命名与录入步骤固定"], ["ok", "成果可以逐项复核"]]],
      ["02 · PLACE　工作环境", "通常需要现场作业", [["info", "档案不能随意带离现场"], ["unknown", "工位与工作时段需确认"]]],
      ["03 · SENSORY　感官条件", "环境一般较稳定", [["match", "独立工位和低人流岗位较常见"], ["unknown", "扫描设备声音需现场确认"]]],
      ["04 · TALK　沟通方式", "固定交接为主", [["info", "每日或每批次进行一次交接"], ["unknown", "临时协调频率需确认"]]]
    ]
  }
];

const clamp = value => Math.max(0.05, Math.min(0.98, value));
const asChoice = value => typeof value === "number" ? value : null;

function customSignals(text = "") {
  return {
    independent: /自己|独立|一个人/.test(text) ? 0.85 : /分工|团队|一起|合作/.test(text) ? 0.42 : 0.55,
    structure: /步骤|规则|问清|提前|计划/.test(text) ? 0.87 : /灵活|马上适应|随机应变/.test(text) ? 0.35 : 0.55,
    sensory: /很吵|噪声|难集中|安静/.test(text) ? 0.9 : /不影响|都可以|无所谓/.test(text) ? 0.25 : /耳机/.test(text) ? 0.7 : 0.55
  };
}

function answerQuote(questionIndex, answer, custom) {
  if (typeof answer === "number") return answer === 3 ? (String(custom?.[questionIndex] || "").trim() || "自定义回答，信息仍待补充") : ANSWER_TEXTS[questionIndex][answer];
  if (typeof answer === "string") return `选择了「${answer.replace(/^exit/, "暂时跳过 ")}」`;
  return "这一题还没有回答";
}

function computeDimensions(answers = {}, custom = {}) {
  const q6 = asChoice(answers[0]);
  const q7 = asChoice(answers[1]);
  const q8 = asChoice(answers[2]);
  const customText = [customSignals(custom[0]), customSignals(custom[1]), customSignals(custom[2])];

  const independent = q6 === 0 ? 0.94 : q6 === 1 ? 0.72 : q6 === 2 ? 0.4 : q6 === 3 ? customText[0].independent : 0.55;
  const asyncText = q6 === 0 ? 0.84 : q6 === 1 ? 0.68 : q6 === 2 ? 0.48 : q6 === 3 ? clamp(customText[0].independent * 0.8 + 0.15) : 0.55;
  const structure = q7 === 0 ? 0.84 : q7 === 1 ? 0.92 : q7 === 2 ? 0.98 : q7 === 3 ? customText[1].structure : 0.55;
  const process = q7 === 0 ? 0.82 : q7 === 1 ? 0.7 : q7 === 2 ? 0.5 : q7 === 3 ? clamp(customText[1].structure * 0.75 + 0.15) : 0.55;
  const lowSensory = q8 === 0 ? 0.22 : q8 === 1 ? 0.7 : q8 === 2 ? 0.96 : q8 === 3 ? customText[2].sensory : 0.55;
  const detail = clamp(0.48 + (structure - 0.5) * 0.38 + (process - 0.5) * 0.22);
  return [structure, independent, asyncText, lowSensory, detail, process].map(clamp);
}

function buildAxes(answers, custom, dimensions) {
  const [structure, independent, , sensory] = dimensions;
  return [
    {
      name: independent >= 0.78 ? "独立作业" : independent <= 0.48 ? "明确分工协作" : "先独立后求助",
      source: "来源 · Q6",
      desc: independent >= 0.78 ? "任务边界清楚时，你更容易独立推进并完成整段工作。" : independent <= 0.48 ? "分工明确、每个人负责一部分时，你更容易稳定参与。" : "你倾向先自己推进，在遇到具体阻碍时再寻求支持。",
      quote: `「${answerQuote(0, answers[0], custom)}」`
    },
    {
      name: structure >= 0.9 ? "变化缓冲" : structure >= 0.72 ? "步骤清晰" : "环境适应弹性",
      source: "来源 · Q7",
      desc: structure >= 0.9 ? "中途变化会显著增加重新启动成本；提前通知和清晰新步骤很重要。" : structure >= 0.72 ? "规则变化时，先获得清楚的新步骤能帮助你继续推进。" : "你对任务变化的适应线索仍需要更多经历来确认。",
      quote: `「${answerQuote(1, answers[1], custom)}」`
    },
    {
      name: sensory >= 0.82 ? "低感官负荷" : sensory >= 0.52 ? "感官调节" : "环境适应",
      source: "来源 · Q8",
      desc: sensory >= 0.82 ? "持续人声会明显占用注意力，安静环境应作为岗位筛选的重要条件。" : sensory >= 0.52 ? "耳机或可控工位能帮助你在有人声的环境中保持专注。" : "目前的回答显示持续人声对你的工作影响较小。",
      quote: `「${answerQuote(2, answers[2], custom)}」`
    }
  ];
}

function scoreJob(job, dimensions) {
  const weights = [1.15, 1, 0.85, 1.1, 0.9, 1];
  const distance = job.profile.reduce((sum, target, index) => sum + Math.abs(target - dimensions[index]) * weights[index], 0) / weights.reduce((a, b) => a + b, 0);
  return Math.round(60 + (1 - distance) * 36);
}

function reasonFor(job, dimensions) {
  const matches = job.profile.map((target, index) => ({ index, delta: Math.abs(target - dimensions[index]) })).sort((a, b) => a.delta - b.delta).slice(0, 2);
  return matches.map(item => `${DIMENSION_LABELS[item.index]}匹配`).join("、");
}

function assessIsyou({ answers = {}, custom = {} } = {}) {
  const dimensions = computeDimensions(answers, custom);
  const jobs = JOB_DEFINITIONS.map(job => ({
    ...job,
    scoreNumber: scoreJob(job, dimensions),
    matchReasons: [reasonFor(job, dimensions)]
  })).sort((a, b) => b.scoreNumber - a.scoreNumber || a.title.localeCompare(b.title, "zh-CN"));
  return {
    dimensions,
    radar: { labels: DIMENSION_LABELS, values: dimensions },
    axes: buildAxes(answers, custom, dimensions),
    jobs,
    answeredCount: [0, 1, 2].filter(index => answers[index] !== undefined).length
  };
}

if (typeof window !== "undefined") window.IsyouAssessment = { assessIsyou };
