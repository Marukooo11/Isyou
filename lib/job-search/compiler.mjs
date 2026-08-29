import { compact } from "./utils.mjs";

const ABSTRACT_TERMS = ["专注", "有创造力", "创造力强", "研究能力强", "聪明", "细心", "耐心", "逻辑好", "性格好", "心流"];
const ACTION_MAP = new Map([
  ["数据分析", ["清洗", "分析", "比较", "解释"]],
  ["数据校验", ["检查", "核对", "定位异常"]],
  ["异常数据", ["检查", "定位", "修正"]],
  ["经营周报", ["整理", "汇总", "制作"]],
  ["制作可视化报告", ["分析", "可视化", "呈现"]],
  ["清洗CSV数据", ["清洗", "转换", "校验"]],
  ["创建三维内容", ["创建", "修改", "优化"]],
  ["建模", ["创建", "修改", "优化"]],
  ["测试", ["执行", "复现", "验证", "记录"]],
  ["排错", ["复现", "定位", "验证"]],
  ["排查", ["排查", "定位", "验证"]],
  ["修理", ["排查", "拆解", "测试", "验证"]]
]);

const DELIVERABLE_HINTS = ["报告", "周报", "模型", "场景", "资产", "渲染图", "素材", "代码", "测试用例", "缺陷记录", "文档", "报表", "方案"];
const OBJECT_HINTS = ["数据", "系统", "软件", "内容", "三维", "空间", "场景", "建筑", "商品", "游戏资产", "流程", "用户", "业务"];

function observable(values) {
  return compact(values).filter(value => !ABSTRACT_TERMS.some(term => value === term || value.startsWith(term)));
}

function inferActions(tasks) {
  const result = [];
  for (const task of tasks) {
    for (const [needle, actions] of ACTION_MAP) if (task.includes(needle)) result.push(...actions);
    const verb = task.match(/^(创建|修改|优化|制作|整理|维护|检查|分析|清洗|设计|执行|记录|复现|定位|研究|编写|搭建|绘制|排查|修理|测试|验证)/)?.[1];
    if (verb) result.push(verb);
  }
  return compact(result);
}

export function compileMarketSearchVector(safeProfile) {
  const tasks = observable(safeProfile.experience.tasks);
  const directionTerms = safeProfile.directions.flatMap(item => [...item.search_keywords, ...item.reasons]);
  const searchable = observable([...tasks, ...directionTerms]);
  const deliverables = observable([
    ...safeProfile.experience.deliverables,
    ...searchable.filter(value => DELIVERABLE_HINTS.some(term => value.includes(term)))
  ]);
  const objects = observable(searchable.filter(value => OBJECT_HINTS.some(term => value.includes(term))));
  const verifiedTools = compact([
    ...safeProfile.tools,
    ...safeProfile.skills.filter(item => item.verified && item.category === "technical").map(item => item.name)
  ]);
  const unknownTools = compact(safeProfile.skills.filter(item => !item.verified && ["technical", "tool"].includes(item.category)).map(item => item.name));

  const workConditions = { must: [], prefer: [], explore: [], unknown: [] };
  for (const constraint of safeProfile.constraints) {
    const level = constraint.level === "hard" ? "must" : constraint.level === "soft" || constraint.level === "preference" ? "prefer" : ["must", "prefer", "explore", "unknown"].includes(constraint.level) ? constraint.level : "unknown";
    workConditions[level].push(constraint);
  }

  const toSeed = item => ({
    canonical_id: item.occupation_id,
    canonical_title_zh: item.title,
    supplied_titles: item.search_titles,
    supplied_keywords: observable(item.search_keywords),
    negative_keywords: item.negative_keywords,
    source_ref: item.occupation_id ? `A_occupation_library:${item.occupation_id}` : "A_recommended_occupations"
  });

  return {
    actions: inferActions(tasks),
    objects,
    deliverables,
    verified_tools: verifiedTools,
    unknown_tools: unknownTools,
    scenarios: compact([...safeProfile.domains, ...safeProfile.location.work_modes]),
    work_conditions: workConditions,
    direction_seeds: safeProfile.directions.map(toSeed),
    fallback_direction_seeds: safeProfile.fallback_directions.map(toSeed),
    evidence_refs: {
      task_count: tasks.length,
      verified_tool_count: verifiedTools.length,
      source_profile_id: safeProfile.profile_id
    }
  };
}

export { ABSTRACT_TERMS };
