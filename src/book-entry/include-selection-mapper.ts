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
	readonly kind: "start" | "end";
	readonly name: string;
};

export function mapIncludeSelection(
	sourceText: string,
	selector: IncludeLineSelector,
): IncludeSelectionMapping {
	const source = authoredLines(sourceText);
	const selected =
		selector.kind === "lines"
			? mapLineExpression(selector.expression, source.length)
			: mapTagExpression(source, selector);
	if (selected.length === 0) {
		return {
			ok: false,
			diagnostic: {
				level: "warning",
				code: "origin-map.selection-mismatch",
				message: `Include selector '${selector.kind}' did not match any source lines.`,
			},
		};
	}
	return { ok: true, lines: selected };
}

// 文件末尾的换行不另起一行：Asciidoctor 读到的行里没有它，算进来会让 `**` 与 `8..` 这类到文件末尾的
// 选取多出一行，与官方输出对不上。
function authoredLines(sourceText: string): string[] {
	const lines = sourceText.split(/\r?\n/u);
	return lines.at(-1) === "" ? lines.slice(0, -1) : lines;
}

// 以下两种选取逐句移植 Asciidoctor 2.0.26 `Reader#preprocess_include_directive`（lib/asciidoctor/reader.rb，
// 选取 lines 与 tags 的两段），并以 aat 实际调用的 Asciidoctor.js 3.0.4 为准核对：两者选取逻辑一致，只有
// TagDirectiveRx 的 \b 在 Ruby 里认 Unicode 单词字符、在 JS 里只认 ASCII，这里跟 JS。行集必须与官方 Reader 的输出逐行一致，否则这次 include 的坐标只能降级
// （10 号书「选取引入」）；所以这里不另立语义，连官方的边角行为一并照搬：倒序范围不选行、`0..` 不选行、
// 只写否定标签时隐含通配、结束标签对不上时从栈里摘掉。

function mapTagExpression(
	lines: readonly string[],
	selector: Extract<IncludeLineSelector, { kind: "tag" | "tags" }>,
): number[] {
	const tags = tagSelection(selector);
	if (!tags) {
		// 没有有效的标签时，官方按整份引入处理，标记行也在内。
		return lines.map((_, index) => index + 1);
	}
	let select: boolean;
	let baseSelect: boolean;
	let wildcard: boolean | undefined;
	const everything = tags.get("**");
	const any = tags.get("*");
	if (everything !== undefined) {
		tags.delete("**");
		select = baseSelect = everything;
		if (any !== undefined) {
			tags.delete("*");
			wildcard = any;
		} else if (!select && tags.values().next().value === false) {
			wildcard = true;
		}
	} else if (any !== undefined) {
		const anyFirst = tags.keys().next().value === "*";
		tags.delete("*");
		wildcard = any;
		select = baseSelect = anyFirst ? !any : false;
	} else {
		select = baseSelect = ![...tags.values()].includes(true);
	}

	const selected: number[] = [];
	const stack: [name: string, select: boolean][] = [];
	let active: string | undefined;
	for (const [index, text] of lines.entries()) {
		const directive = parseTagDirective(text);
		if (!directive) {
			if (select) {
				selected.push(index + 1);
			}
			continue;
		}
		const chosen = tags.get(directive.name);
		if (directive.kind === "end") {
			if (directive.name === active) {
				stack.pop();
				const top = stack.at(-1);
				active = top?.[0];
				select = top ? top[1] : baseSelect;
			} else if (chosen !== undefined) {
				const at = stack.findLastIndex(([name]) => name === directive.name);
				if (at >= 0) {
					stack.splice(at, 1);
				}
			}
		} else if (chosen !== undefined) {
			select = chosen;
			stack.push([directive.name, select]);
			active = directive.name;
		} else if (wildcard !== undefined) {
			select = active !== undefined && !select ? false : wildcard;
			stack.push([directive.name, select]);
			active = directive.name;
		}
	}
	return selected;
}

function tagSelection(
	selector: Extract<IncludeLineSelector, { kind: "tag" | "tags" }>,
): Map<string, boolean> | undefined {
	const definitions =
		selector.kind === "tag"
			? [selector.name]
			: splitDelimited(selector.expression);
	const tags = new Map<string, boolean>();
	for (const definition of definitions) {
		if (definition === "" || definition === "!") {
			continue;
		}
		if (definition.startsWith("!")) {
			tags.set(definition.slice(1), false);
		} else {
			tags.set(definition, true);
		}
	}
	return tags.size > 0 ? tags : undefined;
}

// 与 Asciidoctor 的 TagDirectiveRx 相同：标记出现在行中任意位置，跟在什么注释符号之后都行
// （//、#、--、<!-- …），其后是行尾或空白。只认 // 会让 Python、SQL 等源文件的选取落空。
const tagDirectivePattern = /\b(?:tag|(e)nd)::(\S+?)\[\](?=$|[ \r])/u;

function parseTagDirective(line: string): TagDirective | undefined {
	if (!(line.includes("::") && line.includes("[]"))) {
		return undefined;
	}
	const match = tagDirectivePattern.exec(line);
	if (!match?.[2]) {
		return undefined;
	}
	return { kind: match[1] ? "end" : "start", name: match[2] };
}

function mapLineExpression(expression: string, lineCount: number): number[] {
	const wanted: number[] = [];
	for (const item of splitDelimited(unquote(expression))) {
		const range = item.indexOf("..");
		if (range === -1) {
			wanted.push(rubyInteger(item));
			continue;
		}
		const from = rubyInteger(item.slice(0, range));
		const toText = item.slice(range + 2);
		const to = rubyInteger(toText);
		if (toText === "" || to < 0) {
			wanted.push(from, Number.POSITIVE_INFINITY);
		} else {
			for (let line = from; line <= to; line += 1) {
				wanted.push(line);
			}
		}
	}
	if (wanted.length === 0) {
		// 官方：展开后一个行号也没有（如倒序的 3..1）时 inc_linenos 为 nil，按整份引入处理。
		return Array.from({ length: lineCount }, (_, index) => index + 1);
	}
	const pending = [...new Set(wanted)].toSorted((left, right) => left - right);
	const selected: number[] = [];
	let remaining = false;
	for (let line = 1; line <= lineCount && pending.length > 0; line += 1) {
		if (remaining || pending[0] === Number.POSITIVE_INFINITY) {
			remaining = true;
			selected.push(line);
			continue;
		}
		if (pending[0] === line) {
			selected.push(line);
			pending.shift();
		}
	}
	return selected;
}

// Asciidoctor 的 split_delimited_value：有逗号按逗号切，否则按分号切。Ruby 的 split 去掉尾部的空串，空字符串
// 切出来是空数组：`lines=` 因此按整份引入，`lines=1;3;` 不多出一个选不到任何行的 0。
function splitDelimited(value: string): string[] {
	const parts = value.split(value.includes(",") ? "," : ";");
	while (parts.at(-1) === "") {
		parts.pop();
	}
	return parts;
}

// Ruby 的 String#to_i：跳过前导空白，读可选符号与数字（数字之间可以有单个下划线，如 1_0），读不出数字时是 0。
function rubyInteger(text: string): number {
	const match = /^\s*([+-]?\d+(?:_\d+)*)/u.exec(text);
	return match?.[1] ? Number(match[1].replaceAll("_", "")) : 0;
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
