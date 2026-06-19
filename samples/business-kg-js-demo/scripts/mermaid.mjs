export function renderMermaid(graph, relations, title) {
	const included = new Set(relations);
	const edges = graph.edges.filter((edge) => included.has(edge.relation));
	const nodeLabels = new Set();
	for (const edge of edges) {
		nodeLabels.add(edge.sourceLabel);
		nodeLabels.add(edge.targetLabel);
	}
	const nodes = graph.nodes.filter((node) => nodeLabels.has(node.label));
	const ids = mermaidIds([...nodeLabels]);
	const lines = ["graph TD", `  %% ${title}`];

	for (const node of nodes) {
		const suffix = fieldSuffix(node);
		lines.push(
			`  ${ids.get(node.label)}["${escapeLabel(node.label + suffix)}"]`,
		);
	}

	for (const edge of edges) {
		const label = edgeLabel(edge);
		lines.push(
			`  ${ids.get(edge.sourceLabel)} -->|${escapeLabel(label)}| ${ids.get(edge.targetLabel)}`,
		);
	}

	if (edges.length === 0) {
		lines.push('  Empty["当前视角没有可显示的边"]');
	}

	return `${lines.join("\n")}\n`;
}

function mermaidIds(labels) {
	const ids = new Map();
	labels
		.sort((left, right) => left.localeCompare(right, "zh-Hans-CN"))
		.forEach((label, index) => {
			ids.set(label, `N${index + 1}`);
		});
	return ids;
}

function fieldSuffix(node) {
	const pairs = Object.entries(node.fields)
		.filter(([name]) =>
			[
				"serving",
				"difficulty",
				"storage",
				"temperature",
				"status",
				"sampleInterval",
			].includes(name),
		)
		.flatMap(([name, values]) => values.map((value) => `${name}=${value}`))
		.slice(0, 2);
	return pairs.length > 0 ? `\\n${pairs.join("\\n")}` : "";
}

function edgeLabel(edge) {
	const attrs = Object.entries(edge.attributes)
		.map(([name, value]) => `${name}=${value}`)
		.join(" ");
	return attrs ? `${edge.relation} ${attrs}` : edge.relation;
}

function escapeLabel(value) {
	return value.replaceAll('"', '\\"').replaceAll("|", "/");
}
