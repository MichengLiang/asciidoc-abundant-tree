import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildBusinessGraph, businessTriples } from "./business-graph.mjs";
import { renderMermaid } from "./mermaid.mjs";
import { domains, fixturePolicies } from "./policy.mjs";
import { parseTurtle, projectFixture } from "./projection.mjs";
import { renderCoverageReport } from "./report.mjs";
import { writeBusinessTurtle } from "./turtle.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleRoot = resolve(__dirname, "..");
const repoRoot = resolve(sampleRoot, "../..");
const generatedRoot = join(sampleRoot, "generated");

rmSync(generatedRoot, { force: true, recursive: true });

const graphs = new Map();

for (const policy of fixturePolicies) {
	const fixturePath = join(sampleRoot, "fixtures", policy.fixture);
	const fixtureRelativePath = relative(repoRoot, fixturePath);
	const projectionTurtle = projectFixture(repoRoot, fixtureRelativePath);
	const projectionDataset = parseTurtle(projectionTurtle);
	const graph = buildBusinessGraph(projectionDataset, policy);
	graphs.set(policy.key, graph);

	writeText(`ttl/${policy.key}.projection.ttl`, projectionTurtle);
	writeText(
		`ttl/${policy.key}.business.ttl`,
		await writeBusinessTurtle(businessTriples(graph)),
	);

	const domain = domains.find((item) => item.key === policy.domain);
	for (const [viewName, relations] of Object.entries(domain.viewRelations)) {
		writeText(
			`mermaid/${policy.key}-${viewName}.mmd`,
			renderMermaid(graph, relations, `${policy.title}：${viewName}`),
		);
	}
	writeText(
		`reports/${policy.key}.json`,
		`${JSON.stringify(graphReport(graph), null, 2)}\n`,
	);
}

writeText("reports/coverage.md", renderCoverageReport([...graphs.values()]));

console.log(
	`Generated business KG demo artifacts under ${relative(repoRoot, generatedRoot)}`,
);

function writeText(relativePath, content) {
	const outputPath = join(generatedRoot, relativePath);
	mkdirSync(dirname(outputPath), { recursive: true });
	writeFileSync(outputPath, content, "utf8");
}

function graphReport(graph) {
	return {
		fixture: graph.policy.key,
		hierarchy: graph.policy.hierarchy,
		nodes: graph.nodes.map((node) => ({
			label: node.label,
			roles: node.roles,
			fields: node.fields,
			line: node.line,
		})),
		edges: graph.edges.map((edge) => ({
			source: edge.sourceLabel,
			relation: edge.relation,
			target: edge.targetLabel,
			attributes: edge.attributes,
			origin: edge.origin,
			line: edge.line,
			raw: edge.raw,
		})),
	};
}
