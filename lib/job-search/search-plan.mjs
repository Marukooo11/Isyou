import { compact } from "./utils.mjs";

function query(stage, purpose, query, direction, expectedSources) {
  return {
    stage,
    purpose,
    query: query.replace(/\s+/g, " ").trim(),
    direction_id: direction.canonical_id,
    direction_title: direction.canonical_title_zh,
    language: "zh-CN",
    market: "CN",
    expected_sources: expectedSources
  };
}

export function compileSearchPlan(vector, occupations, safeProfile) {
  const cities = compact([...safeProfile.location.preferred_cities, ...safeProfile.location.acceptable_cities]).slice(0, 3);
  const city = cities[0] || safeProfile.location.current_city || "中国";
  const toolTerms = vector.verified_tools.slice(0, 3).join(" ");
  const actionTerms = vector.actions.slice(0, 3).join(" ");
  const deliverableTerms = vector.deliverables.slice(0, 2).join(" ");

  return occupations.filter(item => item.verified).map(direction => {
    const title = direction.market_titles[0] || direction.canonical_title_zh;
    const tasks = direction.tasks.slice(0, 2).join(" ") || actionTerms;
    const deliverables = direction.deliverables.slice(0, 2).join(" ") || deliverableTerms;
    const discovery = compact([
      `${tasks} ${deliverables} 相关职业`,
      `${tasks} ${deliverables} 岗位职责`,
      `${tasks} 工作内容`
    ]).map(value => query(1, "occupation_discovery", value, direction, ["职业分类", "行业资料", "真实JD"]));
    const opportunities = compact([
      `${title} 招聘 ${city}`,
      `${title} ${city} 校招 社招 实习`,
      `${title} 远程 兼职 项目制`,
      `${toolTerms} ${deliverables} 外包 接单 合作`
    ]).map(value => query(2, "opportunity_search", value, direction, ["企业官网", "招聘平台", "项目平台"]));

    return {
      direction,
      discovery,
      opportunities,
      verification_templates: [
        "{company} {title} 远程 弹性办公",
        "{company} {title} 加班 出差 驻场",
        "{company} 团队沟通 会议",
        "{title} 项目制 异步协作 自由职业"
      ]
    };
  });
}
