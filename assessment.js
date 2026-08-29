// assessment.js — Isyou V4.0  Named-key, 6-dimension system
// Answers: { Q1: 5, Q8: ["A","B"], B7: "A", ... }  (scale 1–7, multiselect string[])

const DIMENSION_LABELS = ["规则稳定", "独立作业", "书面沟通", "低感官负荷", "细节专注", "流程执行"];

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

const clamp = v => Math.max(0.05, Math.min(0.98, v));

// Normalize scale 1–7 answer to 0–1; return def if not answered
function normScale(v, def) {
  if (def === undefined) def = 0.5;
  if (typeof v === "number" && v >= 1 && v <= 7) return (v - 1) / 6;
  return def;
}

// Check if a multiselect answer contains a specific item
function hasItem(answers, key, item) {
  const v = answers[key];
  return Array.isArray(v) && v.includes(item);
}

function computeDimensions(answers) {
  if (!answers) answers = {};

  const q1  = normScale(answers.Q1);
  const q3  = normScale(answers.Q3);
  const q6  = normScale(answers.Q6);
  const q11 = normScale(answers.Q11);
  const q16 = normScale(answers.Q16);

  // Q8 multiselect capability codes
  const q8A = hasItem(answers, "Q8", "A"); // 独立深度工作
  const q8B = hasItem(answers, "Q8", "B"); // 细节校验
  const q8D = hasItem(answers, "Q8", "D"); // 规则明确的任务
  const q8F = hasItem(answers, "Q8", "F"); // 流程执行

  // Q14 environment constraints
  const q14A = hasItem(answers, "Q14", "A"); // 必须安静
  const q14B = hasItem(answers, "Q14", "B"); // 不能被频繁打断
  const q14C = hasItem(answers, "Q14", "C"); // 书面沟通为主

  // Q15 energy drains
  const drainB5 = hasItem(answers, "Q15_drain", "B5"); // 长时间社交
  const drainB6 = hasItem(answers, "Q15_drain", "B6"); // 嘈杂环境

  // ── 规则稳定 ────────────────────────────────────────────────────
  // Q1 (C+): morning routine = structure preference
  // Q11 (C+ dual): detail-checking work is comfortable
  // Q8-D: prefers tasks with clear rules
  const ruleStable = clamp(q1 * 0.40 + q11 * 0.35 + (q8D ? 0.92 : 0.28) * 0.25);

  // ── 独立作业 ────────────────────────────────────────────────────
  // Q3 reversed (E+: high = social → prefers team; low = prefers independent)
  // Q16 (E−: high = quiet at gatherings → prefers independent)
  // Q8-A: selected "independent deep work" as their way of focusing
  const q3rev = 1 - q3;
  const independent = clamp(q3rev * 0.40 + q16 * 0.40 + (q8A ? 0.92 : 0.26) * 0.20);

  // ── 书面沟通 ────────────────────────────────────────────────────
  // Q3 reversed: low extroversion correlates with preferring async/written
  // Q14-C: explicitly stated written-comms preference
  // Q14-B: no-interruptions → indirect written signal
  const q14commScore = q14C ? 0.92 : (q14B ? 0.62 : 0.28);
  const writtenComm = clamp(q3rev * 0.50 + q14commScore * 0.50);

  // ── 低感官负荷 ──────────────────────────────────────────────────
  // Q14-A: must be quiet
  // Q14-B: no frequent interruptions (sensory overlap)
  // Q15-drain-B6: noisy environment drains energy
  // Q15-drain-B5: long social drains (sensory fatigue)
  const sensoryScores = [
    q14A  ? 0.95 : 0,
    q14B  ? 0.70 : 0,
    drainB6 ? 0.88 : 0,
    drainB5 ? 0.52 : 0
  ];
  const anySensory = sensoryScores.some(v => v > 0);
  const lowSensory = anySensory
    ? clamp(Math.max(...sensoryScores) * 0.65 + sensoryScores.reduce((a, b) => a + b, 0) / 4 * 0.35)
    : 0.30;

  // ── 细节专注 ────────────────────────────────────────────────────
  // Q6 (long deep-focus sessions), Q11 (detail-checking task comfortable), Q8-B (detail checking)
  const detailFocus = clamp(q6 * 0.38 + q11 * 0.38 + (q8B ? 0.92 : 0.26) * 0.24);

  // ── 流程执行 ────────────────────────────────────────────────────
  // Q1 (routine morning = process orientation)
  // Q8-F: selected "follow fixed process step by step"
  // Q8-D: selected "clear pass/fail standard"
  const processExec = clamp(q1 * 0.40 + (q8F ? 0.92 : 0.26) * 0.38 + (q8D ? 0.82 : 0.26) * 0.22);

  return [ruleStable, independent, writtenComm, lowSensory, detailFocus, processExec].map(clamp);
}

function buildAxes(answers, dimensions) {
  if (!answers) answers = {};
  const [ruleStable, independent, , lowSensory] = dimensions;

  const q3v = answers.Q3, q16v = answers.Q16, q1v = answers.Q1;
  const q14v = answers.Q14;
  const q14text = Array.isArray(q14v) && q14v.length > 0
    ? "勾选了 " + q14v.join("、")
    : "未勾选任何项";

  return [
    {
      name: independent >= 0.78 ? "独立推进" : independent <= 0.42 ? "协作分工" : "先独立后协作",
      source: "来源 · Q3、Q16",
      desc: independent >= 0.78
        ? "任务边界清楚时，你更容易独立推进并完成整段工作，减少频繁协商的需求。"
        : independent <= 0.42
        ? "分工明确、各负其责时，你更容易稳定参与；完全独立推进会增加不确定感。"
        : "你倾向先独立推进，在遇到具体阻碍时再寻求支持——自主与协作兼顾。",
      quote: "Q3（和陌生人打交道）" + (typeof q3v === "number" ? "你填了 " + q3v + " 分；" : "未回答；") +
             "Q16（聚餐说话量）" + (typeof q16v === "number" ? "你填了 " + q16v + " 分。" : "未回答。")
    },
    {
      name: lowSensory >= 0.75 ? "低感官负荷" : lowSensory >= 0.42 ? "感官可调节" : "感官适应灵活",
      source: "来源 · Q14、Q15",
      desc: lowSensory >= 0.75
        ? "持续噪声或频繁打断会显著消耗注意力，安静或可控的工作环境是重要的筛选条件。"
        : lowSensory >= 0.42
        ? "适度的声音可以通过耳机等方式调节；你对感官环境有偏好但有一定弹性。"
        : "当前回答显示感官环境对你的影响相对较小，环境适应度较强。",
      quote: "Q14 环境偏好：" + q14text + "。"
    },
    {
      name: ruleStable >= 0.78 ? "规则驱动" : ruleStable >= 0.50 ? "规则清晰优先" : "弹性适应",
      source: "来源 · Q1、Q11",
      desc: ruleStable >= 0.78
        ? "明确的规则和流程能让你进入高效状态；「看着办」或频繁变更规则会带来显著负担。"
        : ruleStable >= 0.50
        ? "有基础规则时你能稳定执行；一定程度的灵活性是可以接受的。"
        : "你对不明确情况有一定适应弹性，规则不是硬性前提。",
      quote: "Q1（早晨惯例）" + (typeof q1v === "number" ? "你填了 " + q1v + " 分。" : "未回答。")
    }
  ];
}

function scoreJob(job, dimensions) {
  const weights = [1.15, 1, 0.85, 1.1, 0.9, 1];
  const total = weights.reduce((a, b) => a + b, 0);
  const distance = job.profile.reduce(
    (sum, target, i) => sum + Math.abs(target - dimensions[i]) * weights[i], 0
  ) / total;
  return Math.round(60 + (1 - distance) * 36);
}

function reasonFor(job, dimensions) {
  return job.profile
    .map((target, i) => ({ i, delta: Math.abs(target - dimensions[i]) }))
    .sort((a, b) => a.delta - b.delta)
    .slice(0, 2)
    .map(item => DIMENSION_LABELS[item.i] + "匹配")
    .join("、");
}

function assessIsyou({ answers, followups } = {}) {
  if (!answers) answers = {};
  if (!followups) followups = {};
  const dimensions = computeDimensions(answers);
  const jobs = JOB_DEFINITIONS.map(job => ({
    ...job,
    scoreNumber: scoreJob(job, dimensions),
    matchReasons: [reasonFor(job, dimensions)]
  })).sort((a, b) => b.scoreNumber - a.scoreNumber || a.title.localeCompare(b.title, "zh-CN"));
  return {
    dimensions,
    radar: { labels: DIMENSION_LABELS, values: dimensions },
    axes: buildAxes(answers, dimensions),
    jobs,
    answeredCount: Object.keys(answers).filter(k => {
      const v = answers[k];
      return v !== undefined && v !== null;
    }).length
  };
}

if (typeof window !== "undefined") window.IsyouAssessment = { assessIsyou };
