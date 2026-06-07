import type { Rdf12Graph, Rdf12IriTerm } from "../rdf12-projection/graph";
import { namespaces } from "../rdf12-projection/namespaces";
import { iriTerm, rdf12TermKey } from "../rdf12-projection/terms";
import { type ExportWarning, parsePayloadRaw } from "./payload-parser";
import type { ExportedNode, SourceCoordinate } from "./yaml-shape";

const BUSINESS_ROLES = new Set([
	"adaptation-profile",
	"source-chapter",
	"source-snippet",
	"source-event",
	"character",
	"location",
	"environment-asset",
	"prop",
	"world-rule",
	"visual-rule",
	"quality-rule",
	"adaptation-choice",
	"beat",
	"scene-card",
	"animation-scene",
	"shot",
	"review-note",
	"export-mapping",
]);

const SOURCE_REF_RELS = new Set([
	"adapted-from",
	"derived-from",
	"evidenced-by",
]);

const STRUCTURAL_AAT_FIELDS = new Set([
	"addressLabel",
	"candidateHeading",
	"contentEndLine",
	"contentStartLine",
	"displayLabel",
	"endLine",
	"field-kind",
	"forSelector",
	"format",
	"generatedAddressLabel",
	"headline",
	"officialHref",
	"officialReftext",
	"officialResolvedId",
	"officialResolvedType",
	"payload",
	"payloadId",
	"payloadKind",
	"payloadSelector",
	"raw",
	"relativePath",
	"role",
	"sourceHeading",
	"sourceSelector",
	"startLine",
	"syntax",
	"targetHeading",
	"targetSelector",
]);

export function readBusinessNodes(input: {
	readonly graph: Rdf12Graph;
	readonly scriptTextById?: ReadonlyMap<string, string>;
	readonly warnings: ExportWarning[];
}): ExportedNode[] {
	const headingTerms = businessHeadingTerms(input.graph);
	const nodes: ExportedNode[] = [];

	for (const heading of headingTerms) {
		const roles = literalValues(input.graph, heading, aat("role"));
		for (const role of roles.filter((candidate) =>
			BUSINESS_ROLES.has(candidate),
		)) {
			nodes.push(readBusinessNode({ ...input, heading, role }));
		}
	}

	return nodes;
}

function readBusinessNode(input: {
	readonly graph: Rdf12Graph;
	readonly heading: Rdf12IriTerm;
	readonly role: string;
	readonly scriptTextById?: ReadonlyMap<string, string>;
	readonly warnings: ExportWarning[];
}): ExportedNode {
	const fields = readFields(input.graph, input.heading);
	const relations = readRelations(input.graph, input.heading);
	const id =
		firstLiteral(input.graph, input.heading, aat("addressLabel")) ??
		firstLiteral(input.graph, input.heading, aat("generatedAddressLabel")) ??
		input.heading.value;
	const source = sourceCoordinate(input.graph, input.heading);
	const node: ExportedNode = {
		id,
		role: input.role,
		source,
	};
	assignIfDefined(
		node,
		"title",
		firstLiteral(input.graph, input.heading, aat("headline")),
	);
	assignIfDefined(node, "status", stringField(fields, "status"));
	assignIfDefined(node, "order", numberField(fields, "order"));
	assignIfDefined(node, "sequence", numberField(fields, "sequence"));
	assignIfDefined(node, "function", stringField(fields, "function"));
	assignIfDefined(node, "event", stringField(fields, "event"));
	assignIfDefined(node, "target", stringField(fields, "target"));
	assignIfDefined(node, "production", stringField(fields, "production"));
	assignIfDefined(node, "assigned_to", stringField(fields, "assigned-to"));
	assignIfDefined(node, "scene", stringField(fields, "scene"));
	assignIfDefined(
		node,
		"fields",
		Object.keys(fields).length > 0 ? fields : undefined,
	);
	assignIfDefined(node, "payload", readNodePayload(input));
	assignIfDefined(node, "source_refs", sourceRefs(relations));
	assignIfDefined(node, "realizes", relations.realizes);
	assignIfDefined(node, "characters", relations["features-character"]);
	assignIfDefined(node, "environment", relations["located-at"]?.[0]);
	assignIfDefined(
		node,
		"locations",
		input.role === "location"
			? undefined
			: additionalValues(relations["located-at"]),
	);
	assignIfDefined(node, "props", relations["requires-prop"]);
	assignIfDefined(node, "assets", relations["requires-asset"]);
	assignIfDefined(node, "constraints", relations.constrains);
	assignIfDefined(node, "critiques", relations.critiques);
	assignIfDefined(node, "evidence", relations["evidenced-by"]);
	assignIfDefined(node, "relations", normalizedRelations(relations));
	assignIfDefined(
		node,
		"elements",
		readScriptElements(id, input.role, input.scriptTextById),
	);

	return node;
}

function businessHeadingTerms(graph: Rdf12Graph): Rdf12IriTerm[] {
	const headings = new Map<string, Rdf12IriTerm>();
	for (const triple of graph.match({ predicate: aat("role") })) {
		if (
			triple.subject.termType === "iri" &&
			triple.object.termType === "literal" &&
			BUSINESS_ROLES.has(triple.object.value)
		) {
			headings.set(rdf12TermKey(triple.subject), triple.subject);
		}
	}
	return [...headings.values()];
}

function readRelations(
	graph: Rdf12Graph,
	heading: Rdf12IriTerm,
): Record<string, string[]> {
	const result: Record<string, string[]> = {};
	for (const triple of graph.match({ subject: heading })) {
		const rel = relationLocalName(triple.predicate);
		if (rel === undefined || triple.object.termType !== "iri") {
			continue;
		}
		const targetId =
			firstLiteral(graph, triple.object, aat("addressLabel")) ??
			firstLiteral(graph, triple.object, aat("generatedAddressLabel")) ??
			firstLiteral(graph, triple.object, aat("headline")) ??
			triple.object.value;
		result[rel] = [...(result[rel] ?? []), targetId];
	}
	return result;
}

function sourceCoordinate(
	graph: Rdf12Graph,
	heading: Rdf12IriTerm,
): SourceCoordinate {
	return {
		...optionalProperty(
			"path",
			firstLiteral(graph, heading, aat("relativePath")),
		),
		...optionalProperty(
			"start_line",
			firstInteger(graph, heading, aat("startLine")),
		),
		...optionalProperty(
			"end_line",
			firstInteger(graph, heading, aat("endLine")),
		),
	};
}

function sourceRefs(
	relations: Record<string, string[]>,
): Record<string, string[]> | undefined {
	const refs: Record<string, string[]> = {};
	for (const [rel, targets] of Object.entries(relations)) {
		if (SOURCE_REF_RELS.has(rel)) {
			refs[rel.replaceAll("-", "_")] = targets;
		}
	}
	return Object.keys(refs).length > 0 ? refs : undefined;
}

function readFields(
	graph: Rdf12Graph,
	heading: Rdf12IriTerm,
): Record<string, string | number | boolean> {
	const fields: Record<string, string | number | boolean> = {};
	for (const triple of graph.match({ subject: heading })) {
		if (triple.object.termType !== "literal") {
			continue;
		}
		const fieldName = fieldNameFromAatPredicate(triple.predicate);
		if (fieldName === undefined || STRUCTURAL_AAT_FIELDS.has(fieldName)) {
			continue;
		}
		fields[fieldName] = coerceFieldValue(triple.object.value);
	}
	return fields;
}

function fieldNameFromAatPredicate(
	predicate: Rdf12IriTerm,
): string | undefined {
	if (!predicate.value.startsWith(namespaces.aat)) {
		return undefined;
	}
	const localName = predicate.value.slice(namespaces.aat.length);
	if (localName.startsWith("field-")) {
		return decodeURIComponent(localName.slice("field-".length));
	}
	return localName;
}

function normalizedRelations(
	relations: Record<string, string[]>,
): Record<string, string[]> | undefined {
	const result: Record<string, string[]> = {};
	for (const [rel, targets] of Object.entries(relations)) {
		result[rel.replaceAll("-", "_")] = targets;
	}
	return Object.keys(result).length > 0 ? result : undefined;
}

function readNodePayload(input: {
	readonly graph: Rdf12Graph;
	readonly heading: Rdf12IriTerm;
	readonly warnings: ExportWarning[];
}): unknown {
	const payload = input.graph.match({
		subject: input.heading,
		predicate: aat("payload"),
	})[0]?.object;
	if (payload?.termType !== "iri") {
		return undefined;
	}

	const payloadId =
		firstLiteral(input.graph, payload, aat("payloadId")) ?? payload.value;
	return parsePayloadRaw({
		payloadId,
		...optionalProperty(
			"format",
			firstLiteral(input.graph, payload, aat("format")),
		),
		...optionalProperty("raw", firstLiteral(input.graph, payload, aat("raw"))),
		warnings: input.warnings,
	});
}

function readScriptElements(
	id: string,
	role: string,
	scriptTextById: ReadonlyMap<string, string> | undefined,
): Array<{ readonly type: string; readonly text: string }> | undefined {
	if (role !== "animation-scene") {
		return undefined;
	}
	const script = scriptTextById?.get(id);
	return script === undefined
		? undefined
		: [{ type: "raw_script", text: script }];
}

function relationLocalName(predicate: Rdf12IriTerm): string | undefined {
	return predicate.value.startsWith(namespaces.rel)
		? predicate.value.slice(namespaces.rel.length)
		: undefined;
}

function aat(localName: string): Rdf12IriTerm {
	return iriTerm(`${namespaces.aat}${localName}`);
}

function firstLiteral(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): string | undefined {
	return literalValues(graph, subject, predicate)[0];
}

function firstInteger(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): number | undefined {
	const value = firstLiteral(graph, subject, predicate);
	if (value === undefined) {
		return undefined;
	}
	const parsed = Number.parseInt(value, 10);
	return Number.isNaN(parsed) ? undefined : parsed;
}

function literalValues(
	graph: Rdf12Graph,
	subject: Rdf12IriTerm,
	predicate: Rdf12IriTerm,
): string[] {
	return graph
		.match({ subject, predicate })
		.flatMap((triple) =>
			triple.object.termType === "literal" ? [triple.object.value] : [],
		);
}

function coerceFieldValue(value: string): string | number | boolean {
	if (value === "true") {
		return true;
	}
	if (value === "false") {
		return false;
	}
	if (/^-?\d+$/u.test(value)) {
		return Number.parseInt(value, 10);
	}
	return value;
}

function stringField(
	fields: Record<string, string | number | boolean>,
	name: string,
): string | undefined {
	const value = fields[name];
	return typeof value === "string" ? value : undefined;
}

function numberField(
	fields: Record<string, string | number | boolean>,
	name: string,
): number | undefined {
	const value = fields[name];
	return typeof value === "number" ? value : undefined;
}

function additionalValues(values: string[] | undefined): string[] | undefined {
	if (values === undefined || values.length <= 1) {
		return undefined;
	}
	return values.slice(1);
}

function optionalProperty<const K extends string, V>(
	key: K,
	value: V | undefined,
): Record<K, V> | Record<string, never> {
	return value === undefined ? {} : ({ [key]: value } as Record<K, V>);
}

function assignIfDefined<K extends keyof ExportedNode>(
	node: ExportedNode,
	key: K,
	value: ExportedNode[K] | undefined,
): void {
	if (value !== undefined) {
		(node as Record<K, ExportedNode[K]>)[key] = value;
	}
}
