import type { AbundantDocument, OutputFormat } from "./model";

export function formatAbundantTree(document: AbundantDocument): string {
	return formatValue(document, 0, "document").join("\n");
}

export function serializeAbundantTreeToJson(
	document: AbundantDocument,
): AbundantDocument {
	return JSON.parse(JSON.stringify(document)) as AbundantDocument;
}

export function serializeAbundantTree(
	document: AbundantDocument,
	format: OutputFormat,
): string {
	return format === "json"
		? `${JSON.stringify(serializeAbundantTreeToJson(document), null, 2)}\n`
		: `${formatAbundantTree(document)}\n`;
}

function formatValue(value: unknown, depth: number, label: string): string[] {
	if (Array.isArray(value)) {
		return formatArray(value, depth, label);
	}

	if (isPlainObject(value)) {
		return formatObject(value as Record<string, unknown>, depth, label);
	}

	if (isMultilineString(value)) {
		return formatMultilineScalar(value, depth, label);
	}

	return [`${indent(depth)}${label}: ${formatScalar(value)}`];
}

function formatArray(
	values: unknown[],
	depth: number,
	label: string,
): string[] {
	const lines = [`${indent(depth)}${label}[]`];

	values.forEach((item, index) => {
		if (Array.isArray(item)) {
			lines.push(...formatArray(item, depth + 1, `[${index}]`));
			return;
		}

		if (isPlainObject(item)) {
			lines.push(
				...formatObject(
					item as Record<string, unknown>,
					depth + 1,
					`[${index}]`,
				),
			);
			return;
		}

		lines.push(`${indent(depth + 1)}[${index}]: ${formatScalar(item)}`);
	});

	return lines;
}

function formatObject(
	object: Record<string, unknown>,
	depth: number,
	label: string,
): string[] {
	const headline = buildHeadline(object, label);
	const lines = [`${indent(depth)}<${headline}>`];

	for (const key of orderedChildKeys(object)) {
		lines.push(...formatValue(object[key], depth + 1, key));
	}

	return lines;
}

function formatMultilineScalar(
	value: string,
	depth: number,
	label: string,
): string[] {
	return [
		`${indent(depth)}${label}:`,
		...value.split("\n").map((line) => `${indent(depth + 1)}${line}`),
	];
}

function buildHeadline(object: Record<string, unknown>, label: string): string {
	const nodeName =
		typeof object.kind === "string" && object.kind.length > 0
			? object.kind
			: label;
	const parts = [nodeName];

	for (const key of orderedScalarKeys(object)) {
		if (key === "kind") {
			continue;
		}
		const value = object[key];
		parts.push(`${key}=${formatScalar(value)}`);
	}

	return parts.join(" ");
}

function orderedChildKeys(object: Record<string, unknown>): string[] {
	const keys = Object.keys(object).filter(
		(key) => !isScalar(object[key]) || isMultilineString(object[key]),
	);
	const priority = [
		"parser",
		"title",
		"text",
		"content",
		"children",
		"metadata",
		"targets",
		"xrefOccurrences",
		"anchorOccurrences",
		"toolDiagnostics",
	].filter((key) => keys.includes(key));
	const rest = keys
		.filter((key) => !priority.includes(key))
		.sort((a, b) => a.localeCompare(b));
	return [...priority, ...rest];
}

function orderedScalarKeys(object: Record<string, unknown>): string[] {
	return Object.keys(object)
		.filter((key) => isScalar(object[key]) && !isMultilineString(object[key]))
		.sort((a, b) => {
			if (a === "kind") {
				return -1;
			}
			if (b === "kind") {
				return 1;
			}
			return a.localeCompare(b);
		});
}

function isScalar(value: unknown): boolean {
	return value === null || value === undefined || typeof value !== "object";
}

function isMultilineString(value: unknown): value is string {
	return typeof value === "string" && value.includes("\n");
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatScalar(value: unknown): string {
	if (typeof value === "string") {
		return `"${escapeAttribute(value)}"`;
	}
	if (value === undefined) {
		return "undefined";
	}
	return String(value);
}

function indent(depth: number): string {
	return "    ".repeat(depth);
}

function escapeAttribute(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll('"', "&quot;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}
