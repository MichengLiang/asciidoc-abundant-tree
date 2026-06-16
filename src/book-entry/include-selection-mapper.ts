import type { BookEntryDiagnostic } from "./diagnostics";
import type { IncludeAttributeSurface } from "./include-attribute-model";

export type IncludeLineSelector = Extract<
	IncludeAttributeSurface,
	{ kind: "tag" | "tags" | "lines" }
>;

export type IncludeSelectionMapping =
	| {
			readonly ok: true;
			readonly lines: readonly number[];
	  }
	| SelectionMismatchDiagnostic;

export type SelectionMismatchDiagnostic = {
	readonly ok: false;
	readonly diagnostic: BookEntryDiagnostic;
};

type TagDirective = {
	readonly line: number;
	readonly kind: "start" | "end";
	readonly name: string;
};

export function mapIncludeSelection(
	sourceText: string,
	selector: IncludeLineSelector,
): IncludeSelectionMapping {
	const lineCount = sourceText.split(/\r?\n/u).length;
	const lines =
		selector.kind === "lines"
			? mapLineExpression(selector.expression, lineCount)
			: mapTagExpression(sourceText, selector);
	if (lines.length === 0) {
		return {
			ok: false,
			diagnostic: {
				level: "warning",
				code: "origin-map.selection-mismatch",
				message: `Include selector '${selector.kind}' did not match any source lines.`,
			},
		};
	}
	return { ok: true, lines };
}

function mapTagExpression(
	sourceText: string,
	selector: Extract<IncludeLineSelector, { kind: "tag" | "tags" }>,
): number[] {
	const lines = sourceText.split(/\r?\n/u);
	const directives = tagDirectives(lines);
	const directiveLines = new Set(directives.map((directive) => directive.line));
	if (selector.kind === "tag") {
		if (selector.name === "**") {
			return lines
				.map((_, index) => index + 1)
				.filter((lineNumber) => !directiveLines.has(lineNumber));
		}
		if (selector.name === "*") {
			return activeTagLines(lines, (active) => active.size > 0);
		}
		return activeTagLines(lines, (active) => active.has(selector.name));
	}

	const terms = selector.expression
		.split(";")
		.map((term) => term.trim())
		.filter(Boolean);
	const includes = terms.filter((term) => !term.startsWith("!"));
	const excludes = terms
		.filter((term) => term.startsWith("!"))
		.map((term) => term.slice(1));

	return activeTagLines(lines, (active) => {
		const included =
			includes.length === 0 ||
			includes.some((name) =>
				name === "*" || name === "**" ? active.size > 0 : active.has(name),
			);
		const excluded = excludes.some((name) =>
			name === "*" || name === "**" ? active.size > 0 : active.has(name),
		);
		return included && !excluded;
	});
}

function activeTagLines(
	lines: readonly string[],
	includeLine: (active: ReadonlySet<string>) => boolean,
): number[] {
	const active = new Set<string>();
	const selected: number[] = [];
	for (const [index, text] of lines.entries()) {
		const lineNumber = index + 1;
		const directive = parseTagDirective(text, lineNumber);
		if (directive?.kind === "start") {
			active.add(directive.name);
			continue;
		}
		if (directive?.kind === "end") {
			active.delete(directive.name);
			continue;
		}
		if (includeLine(active)) {
			selected.push(lineNumber);
		}
	}
	return selected;
}

function tagDirectives(lines: readonly string[]): TagDirective[] {
	return lines.flatMap((line, index) => {
		const directive = parseTagDirective(line, index + 1);
		return directive ? [directive] : [];
	});
}

function parseTagDirective(
	line: string,
	lineNumber: number,
): TagDirective | undefined {
	const start = /^\s*\/\/\s*tag::([^[]+)\[\]\s*$/u.exec(line);
	if (start?.[1]) {
		return { line: lineNumber, kind: "start", name: start[1] };
	}
	const end = /^\s*\/\/\s*end::([^[]+)\[\]\s*$/u.exec(line);
	if (end?.[1]) {
		return { line: lineNumber, kind: "end", name: end[1] };
	}
	return undefined;
}

function mapLineExpression(expression: string, lineCount: number): number[] {
	const normalized = unquote(expression);
	const items = normalized
		.split(/[;,]/u)
		.map((item) => item.trim())
		.filter(Boolean);
	const selected = new Set<number>();
	for (const item of items) {
		for (const line of expandLineRange(item, lineCount)) {
			selected.add(line);
		}
	}
	return [...selected].toSorted((left, right) => left - right);
}

function expandLineRange(item: string, lineCount: number): number[] {
	if (!item.includes("..")) {
		const line = Number(item);
		return Number.isInteger(line) && line >= 1 && line <= lineCount
			? [line]
			: [];
	}
	const [startRaw = "", endRaw = ""] = item.split("..");
	const start = Number(startRaw);
	const end =
		endRaw === "" || endRaw === "-1"
			? lineCount
			: Math.min(Number(endRaw), lineCount);
	if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1) {
		return [];
	}
	const result: number[] = [];
	for (let line = start; line <= end; line += 1) {
		result.push(line);
	}
	return result;
}

function unquote(value: string): string {
	if (
		(value.startsWith(`"`) && value.endsWith(`"`)) ||
		(value.startsWith("'") && value.endsWith("'"))
	) {
		return value.slice(1, -1);
	}
	return value;
}
