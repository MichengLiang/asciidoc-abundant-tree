export function renderCoverageReport(graphs) {
	const features = [
		{
			name: "标题层级按约定解释为业务边",
			when: (graph) =>
				graph.edges.some((edge) => edge.origin === "hierarchy-policy"),
		},
		{
			name: "描述列表挂载节点字段与 role 字段",
			when: (graph) => graph.policy.key.includes("dlist"),
		},
		{
			name: "标题前 attrlist 挂载节点字段",
			when: (graph) => graph.policy.key.includes("attrlist"),
		},
		{
			name: "xref rel 声明显式业务边",
			when: (graph) =>
				graph.edges.some((edge) => edge.origin === "explicit-xref"),
		},
		{
			name: "xref named attributes 声明边属性",
			when: (graph) =>
				graph.edges.some((edge) => Object.keys(edge.attributes).length > 0),
		},
		{
			name: "输出 Mermaid 业务视角",
			when: () => true,
		},
		{
			name: "输出 projection TTL 与 business TTL",
			when: () => true,
		},
	];

	return [
		"# 业务知识图谱 JS 样例覆盖报告",
		"",
		"本报告列出两篇业务文档共同覆盖的演示特性。每个特性至少由一篇文档展示。",
		"",
		"## 文档",
		...graphs.map(
			(graph) =>
				`- ${graph.policy.key}: ${graph.policy.title}；标题层级解释为 \`${graph.policy.hierarchy.relation}\`。`,
		),
		"",
		"## 特性覆盖",
		...features.map((feature) => featureLine(feature, graphs)),
		"",
	].join("\n");
}

function featureLine(feature, graphs) {
	const coveredBy = graphs
		.filter((graph) => feature.when(graph))
		.map((graph) => graph.policy.key);
	return coveredBy.length > 0
		? `- ${feature.name}: ${coveredBy.join(", ")}`
		: `- ${feature.name}: 未覆盖`;
}
