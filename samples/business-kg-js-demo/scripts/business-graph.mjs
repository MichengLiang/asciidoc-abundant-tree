import { DataFactory } from "n3";
import { aat, rdf, rel } from "./projection.mjs";

const { namedNode } = DataFactory;

const ignoredHeadings = new Set(["建模约定"]);
const aatFieldLocalNames = new Set([
	"headline",
	"addressLabel",
	"generatedAddressLabel",
	"headingLevel",
	"headingLine",
	"startLine",
	"endLine",
	"contentStartLine",
	"contentEndLine",
	"metadataStartLine",
	"metadataEndLine",
	"childOrder",
	"documentOrder",
	"raw",
	"relativePath",
	"role",
	"containsDirectly",
	"references",
]);

export function buildBusinessGraph(dataset, policy) {
	const headingTerms = dataset.subjects(rdf("type"), aat("Heading"));
	const nodes = headingTerms
		.map((term) => headingNode(dataset, term))
		.filter((node) => node.level !== "0" && !ignoredHeadings.has(node.label));
	const nodeById = new Map(nodes.map((node) => [node.id, node]));
	const nodeByTerm = new Map(nodes.map((node) => [node.term.value, node]));
	const edges = [
		...hierarchyEdges(dataset, policy, nodeByTerm),
		...xrefEdges(dataset, nodeByTerm),
	].filter((edge) => nodeById.has(edge.source) && nodeById.has(edge.target));

	return {
		policy,
		nodes,
		edges: dedupeEdges(edges),
	};
}

function headingNode(dataset, term) {
	const label = dataset.literal(term, aat("headline")) ?? term.value;
	const fields = {};
	for (const quad of dataset.match(term, undefined, undefined)) {
		const fieldName = headingFieldName(quad.predicate);
		if (!fieldName) continue;
		if (!fields[fieldName]) fields[fieldName] = [];
		fields[fieldName].push(quad.object.value);
	}
	return {
		id: term.value,
		term,
		label,
		roles: dataset.literals(term, aat("role")),
		fields,
		line: dataset.literal(term, aat("headingLine")),
		level: dataset.literal(term, aat("headingLevel")),
	};
}

function headingFieldName(predicate) {
	if (
		!predicate.value.startsWith(
			"https://micheng.dev/ns/asciidoc-abundant-tree#",
		)
	) {
		return undefined;
	}
	const localName = predicate.value.slice(
		"https://micheng.dev/ns/asciidoc-abundant-tree#".length,
	);
	if (aatFieldLocalNames.has(localName)) {
		return undefined;
	}
	return decodeURIComponent(localName.replace(/^field-/, ""));
}

function hierarchyEdges(dataset, policy, nodeByTerm) {
	const edges = [];
	for (const quad of dataset.match(
		undefined,
		aat("containsDirectly"),
		undefined,
	)) {
		const parent = nodeByTerm.get(quad.subject.value);
		const child = nodeByTerm.get(quad.object.value);
		if (!parent || !child) continue;
		const [source, target] =
			policy.hierarchy.direction === "child-to-parent"
				? [child, parent]
				: [parent, child];
		edges.push({
			source: source.id,
			sourceLabel: source.label,
			relation: policy.hierarchy.relation,
			target: target.id,
			targetLabel: target.label,
			attributes: {},
			origin: "hierarchy-policy",
			line: child.line,
			raw: `${parent.label} containsDirectly ${child.label}`,
		});
	}
	return edges;
}

function xrefEdges(dataset, nodeByTerm) {
	const edges = [];
	for (const edgeTerm of dataset.subjects(rdf("type"), aat("XrefEdge"))) {
		const sourceTerm = dataset.objects(edgeTerm, aat("sourceHeading"))[0];
		const targetTerm = dataset.objects(edgeTerm, aat("targetHeading"))[0];
		const source = sourceTerm ? nodeByTerm.get(sourceTerm.value) : undefined;
		const target = targetTerm ? nodeByTerm.get(targetTerm.value) : undefined;
		if (!source || !target) continue;
		const relation = dataset.literal(edgeTerm, aat("rel")) ?? "references";
		edges.push({
			source: source.id,
			sourceLabel: source.label,
			relation,
			target: target.id,
			targetLabel: target.label,
			attributes: edgeAttributes(dataset, edgeTerm),
			origin: "explicit-xref",
			line: dataset.literal(edgeTerm, aat("startLine")),
			raw: dataset.literal(edgeTerm, aat("raw")) ?? "",
		});
	}
	return edges;
}

function edgeAttributes(dataset, edgeTerm) {
	const attributes = {};
	for (const quad of dataset.match(edgeTerm, undefined, undefined)) {
		const fieldName = edgeAttributeName(quad.predicate);
		if (!fieldName) continue;
		attributes[fieldName] = quad.object.value;
	}
	return attributes;
}

function edgeAttributeName(predicate) {
	if (
		!predicate.value.startsWith(
			"https://micheng.dev/ns/asciidoc-abundant-tree#",
		)
	) {
		return undefined;
	}
	const localName = predicate.value.slice(
		"https://micheng.dev/ns/asciidoc-abundant-tree#".length,
	);
	const reserved = new Set([
		"sourceHeading",
		"targetHeading",
		"sourceSelector",
		"targetSelector",
		"rel",
		"raw",
		"relativePath",
		"startLine",
		"endLine",
		"startColumn",
		"endColumn",
		"syntax",
		"displayLabel",
		"officialHref",
		"officialReftext",
		"officialResolvedId",
		"officialResolvedType",
	]);
	if (reserved.has(localName)) {
		return undefined;
	}
	return decodeURIComponent(localName.replace(/^field-/, ""));
}

function dedupeEdges(edges) {
	const seen = new Set();
	const deduped = [];
	for (const edge of edges) {
		const key = JSON.stringify({
			source: edge.sourceLabel,
			relation: edge.relation,
			target: edge.targetLabel,
			attributes: edge.attributes,
			origin: edge.origin,
		});
		if (seen.has(key)) continue;
		seen.add(key);
		deduped.push(edge);
	}
	return deduped.sort((left, right) =>
		`${left.sourceLabel}|${left.relation}|${left.targetLabel}`.localeCompare(
			`${right.sourceLabel}|${right.relation}|${right.targetLabel}`,
			"zh-Hans-CN",
		),
	);
}

export function businessTriples(graph) {
	const triples = [];
	for (const node of graph.nodes) {
		triples.push([
			iriForNode(node),
			namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
			namedNode("https://micheng.dev/ns/business-kg-demo#Node"),
		]);
		triples.push([
			iriForNode(node),
			namedNode("http://www.w3.org/2000/01/rdf-schema#label"),
			literal(node.label),
		]);
		for (const role of node.roles) {
			triples.push([
				iriForNode(node),
				namedNode("https://micheng.dev/ns/business-kg-demo#nodeKind"),
				literal(role),
			]);
		}
		for (const [name, values] of Object.entries(node.fields)) {
			for (const value of values) {
				triples.push([
					iriForNode(node),
					namedNode(
						`https://micheng.dev/ns/business-kg-demo#${encodeURIComponent(name)}`,
					),
					literal(value),
				]);
			}
		}
	}
	for (const edge of graph.edges) {
		triples.push([
			iriForLabel(edge.sourceLabel),
			rel(edge.relation),
			iriForLabel(edge.targetLabel),
		]);
		const edgeIri = iriForEdge(edge);
		triples.push([
			edgeIri,
			namedNode("http://www.w3.org/1999/02/22-rdf-syntax-ns#type"),
			namedNode("https://micheng.dev/ns/business-kg-demo#Edge"),
		]);
		triples.push([
			edgeIri,
			namedNode("https://micheng.dev/ns/business-kg-demo#edgeSource"),
			iriForLabel(edge.sourceLabel),
		]);
		triples.push([
			edgeIri,
			namedNode("https://micheng.dev/ns/business-kg-demo#edgeTarget"),
			iriForLabel(edge.targetLabel),
		]);
		triples.push([
			edgeIri,
			namedNode("https://micheng.dev/ns/business-kg-demo#edgeRelation"),
			literal(edge.relation),
		]);
		triples.push([
			edgeIri,
			namedNode("https://micheng.dev/ns/business-kg-demo#edgeOrigin"),
			literal(edge.origin),
		]);
		if (edge.line !== undefined) {
			triples.push([
				edgeIri,
				namedNode("https://micheng.dev/ns/business-kg-demo#sourceLine"),
				literal(edge.line),
			]);
		}
		if (edge.raw) {
			triples.push([
				edgeIri,
				namedNode("https://micheng.dev/ns/business-kg-demo#raw"),
				literal(edge.raw),
			]);
		}
		for (const [name, value] of Object.entries(edge.attributes)) {
			triples.push([
				edgeIri,
				namedNode(
					`https://micheng.dev/ns/business-kg-demo#edge-${encodeURIComponent(name)}`,
				),
				literal(value),
			]);
		}
	}
	return triples;
}

function iriForNode(node) {
	return iriForLabel(node.label);
}

function iriForLabel(label) {
	return namedNode(
		`https://micheng.dev/ns/business-kg-demo/resource/${encodeURIComponent(label)}`,
	);
}

function iriForEdge(edge) {
	return namedNode(
		`https://micheng.dev/ns/business-kg-demo/edge/${encodeURIComponent(
			`${edge.sourceLabel}-${edge.relation}-${edge.targetLabel}-${edge.origin}`,
		)}`,
	);
}

function literal(value) {
	return DataFactory.literal(String(value));
}
