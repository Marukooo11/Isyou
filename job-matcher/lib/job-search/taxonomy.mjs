import { compact } from "./utils.mjs";

const MARKET_SYNONYMS = [
  { pattern: /数据分析/, titles: ["数据分析师", "初级数据分析师", "业务数据分析师", "数据分析助理"], tasks: ["数据清洗", "指标分析", "报表制作"], deliverables: ["分析报告", "经营报表"] },
  { pattern: /数据质量|数据质检|数据治理/, titles: ["数据质量专员", "数据质检专员", "数据治理助理", "数据审核专员"], tasks: ["数据校验", "异常定位", "质量规则维护"], deliverables: ["质量报告", "异常清单"] },
  { pattern: /商业分析|业务分析|经营分析/, titles: ["商业分析助理", "业务分析助理", "经营分析助理", "商业数据分析实习生"], tasks: ["经营分析", "业务指标拆解", "报告制作"], deliverables: ["经营分析报告", "业务洞察"] },
  { pattern: /软件测试|测试工程|QA/, titles: ["软件测试工程师", "初级软件测试工程师", "功能测试工程师", "QA工程师", "测试助理"], tasks: ["测试执行", "缺陷复现", "测试用例编写"], deliverables: ["测试用例", "缺陷记录", "测试报告"] },
  { pattern: /运营分析|数据运营/, titles: ["运营分析专员", "数据运营专员", "业务运营分析", "运营数据分析助理"], tasks: ["运营数据分析", "报表维护", "指标监控"], deliverables: ["运营报表", "分析报告"] },
  { pattern: /三维|3D|建模|场景美术/, titles: ["3D场景美术", "三维模型师", "三维设计师", "建筑可视化设计师", "商品建模师"], tasks: ["三维建模", "场景搭建", "材质与渲染"], deliverables: ["三维模型", "场景资产", "渲染图", "可复用素材"] }
];

export function expandTaxonomy(vector, seedKey = "direction_seeds") {
  return (vector[seedKey] || []).map(seed => {
    const combined = [seed.canonical_title_zh, ...seed.supplied_titles, ...seed.supplied_keywords].join(" ");
    const matches = MARKET_SYNONYMS.filter(entry => entry.pattern.test(combined));
    const marketTitles = compact([seed.canonical_title_zh, ...seed.supplied_titles, ...matches.flatMap(entry => entry.titles)]);
    return {
      canonical_id: seed.canonical_id,
      canonical_title_zh: seed.canonical_title_zh,
      market_titles: marketTitles,
      tasks: compact([...seed.supplied_keywords, ...matches.flatMap(entry => entry.tasks)]),
      deliverables: compact(matches.flatMap(entry => entry.deliverables)),
      negative_keywords: seed.negative_keywords,
      source_refs: compact([seed.source_ref, ...(matches.length ? ["CN_market_synonym_registry:v1"] : [])]),
      source_level: seed.canonical_id ? "local_taxonomy" : matches.length ? "market_evidence" : "unverified_title",
      verified: Boolean(seed.canonical_id || matches.length)
    };
  });
}

export function taxonomyFallbacks(profile) {
  return (profile.occupation_match || [])
    .filter(item => item.user_status !== "rejected" && item.verdict !== "hold" && item.name)
    .map(item => ({
      occupation_id: item.occupation_id,
      title: item.name,
      search_titles: [item.name],
      search_keywords: [],
      negative_keywords: [],
      reasons: item.basis || [],
      readiness: "unknown"
    }));
}

export { MARKET_SYNONYMS };
