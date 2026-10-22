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

// 选取的行集必须与官方 Reader 为这次 include 推入的行逐行一致，否则坐标只能降级（10 号书「选取引入」）。
// 所以这里逐句移植 aat 实际运行的 Asciidoctor.js 4.1.1（packages/core/src/reader.js：选取的解析在
// preprocessIncludeDirective 1379-1417 行，#filterLinesByLinenos 1623 行，#filterLinesByTags 1660 行，
// #splitDelimitedValue 1853 行），连它与 Ruby 2.0.26 不同的地方一并照搬：文件按 split('\n') 切行，以换行
// 结尾时末尾多出一个空行，选到文件末尾的选取会带上它；数字用 parseInt，`1_0` 是 1 而不是 Ruby 的 10。
// 这两处已报给上游（asciidoctor/asciidoctor.js#1898）；上游改成与 Ruby 一致以后，这里要跟着改，否则选取的行集对不上。
export function mapIncludeSelection(
	sourceText: string,
	selector: IncludeLineSelector,
): IncludeSelectionMapping {
	const fileLines = sourceText.split("\n");
	const selected =
		selector.kind === "lines"
			? selectByLinenos(fileLines, selector.expression)
			: selectByTags(fileLines, selector);
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

// 不过滤时官方走整份引入：推入整段内容，先去掉末尾一个换行再切行（reader.js 720 行），末尾没有那个空行。
function wholeFile(fileLines: readonly string[]): number[] {
	const count =
		fileLines.at(-1) === "" ? fileLines.length - 1 : fileLines.length;
	return Array.from({ length: count }, (_, index) => index + 1);
}

function selectByLinenos(
	fileLines: readonly string[],
	expression: string,
): number[] {
	let wanted: number[] = [];
	for (const ld of splitDelimitedValue(expression)) {
		if (ld.includes("..")) {
			const sep = ld.indexOf("..");
			const from = Number.parseInt(ld.slice(0, sep), 10);
			const toStr = ld.slice(sep + 2);
			if (toStr === "" || Number.parseInt(toStr, 10) < 0) {
				wanted.push(from, Number.POSITIVE_INFINITY);
			} else {
				const to = Number.parseInt(toStr, 10);
				for (let i = from; i <= to; i++) wanted.push(i);
			}
		} else {
			wanted.push(Number.parseInt(ld, 10));
		}
	}
	if (wanted.length === 0) {
		// 一个行号也没展开出来（如倒序的 3..1）时官方不过滤，按整份引入。
		return wholeFile(fileLines);
	}
	// 与官方同一个比较函数：NaN 混在里面时排出的顺序也相同。
	wanted = [...new Set(wanted)].sort((a, b) => a - b);
	const remaining = [...wanted];
	const selected: number[] = [];
	let selectRemaining = false;
	for (let index = 0; index < fileLines.length; index++) {
		const lineno = index + 1;
		if (remaining[0] === Number.POSITIVE_INFINITY) {
			selectRemaining = true;
		}
		if (selectRemaining) {
			selected.push(lineno);
		} else if (remaining[0] === lineno) {
			selected.push(lineno);
			remaining.shift();
			if (remaining.length === 0) break;
		}
	}
	return selected;
}

// 官方用普通对象作选择表：形如整数的键排在最前，“第一个键是不是 *”“第一个值是不是 false”都按这个顺序判断。
type TagSelection = Record<string, boolean>;

function tagSelection(
	selector: Extract<IncludeLineSelector, { kind: "tag" | "tags" }>,
): TagSelection | undefined {
	if (selector.kind === "tag") {
		const tag = selector.name;
		if (!tag || tag === "!") return undefined;
		return tag.startsWith("!") ? { [tag.slice(1)]: false } : { [tag]: true };
	}
	const tags: TagSelection = Object.create(null);
	for (const td of splitDelimitedValue(selector.expression)) {
		if (td && td !== "!") {
			tags[td.startsWith("!") ? td.slice(1) : td] = !td.startsWith("!");
		}
	}
	return Object.keys(tags).length === 0 ? undefined : tags;
}

// 与 Asciidoctor 的 TagDirectiveRx 相同：标记出现在行中任意位置，跟在什么注释符号之后都行
// （//、#、--、<!-- …），其后是行尾或空白。只认 // 会让 Python、SQL 等源文件的选取落空。
const tagDirectivePattern = /\b(?:tag|(e)nd)::(\S+?)\[\](?=$|[ \r])/u;

function selectByTags(
	fileLines: readonly string[],
	selector: Extract<IncludeLineSelector, { kind: "tag" | "tags" }>,
): number[] {
	const chosen = tagSelection(selector);
	if (!chosen) {
		// 没有有效的标签时官方不过滤，按整份引入，标记行也在内。
		return wholeFile(fileLines);
	}
	const tags: TagSelection = { ...chosen };
	let select: boolean;
	let baseSelect: boolean;
	let wildcard: boolean | undefined;
	if ("**" in tags) {
		select = baseSelect = tags["**"] as boolean;
		delete tags["**"];
		if ("*" in tags) {
			wildcard = tags["*"];
			delete tags["*"];
		} else if (!select && Object.values(tags)[0] === false) wildcard = true;
	} else if ("*" in tags) {
		if (Object.keys(tags)[0] === "*") {
			wildcard = tags["*"] as boolean;
			select = baseSelect = !wildcard;
		} else {
			select = baseSelect = false;
			wildcard = tags["*"];
		}
		delete tags["*"];
	} else {
		select = baseSelect = !Object.values(tags).includes(true);
	}

	const selected: number[] = [];
	const tagStack: [name: string, select: boolean][] = [];
	let activeTag: string | null = null;
	for (const [index, line] of fileLines.entries()) {
		if (line.includes("::") && line.includes("[]")) {
			const match = tagDirectivePattern.exec(line);
			if (match?.[2]) {
				const [, isEnd, thisTag] = match;
				if (isEnd) {
					if (thisTag === activeTag) {
						tagStack.pop();
						const top = tagStack.at(-1);
						[activeTag, select] = top ? top : [null, baseSelect];
					} else if (Object.hasOwn(tags, thisTag)) {
						const at = tagStack.findLastIndex(([name]) => name === thisTag);
						if (at >= 0) tagStack.splice(at, 1);
					}
				} else if (Object.hasOwn(tags, thisTag)) {
					select = tags[thisTag] as boolean;
					activeTag = thisTag;
					tagStack.push([activeTag, select]);
				} else if (wildcard !== undefined) {
					select = activeTag && !select ? false : wildcard;
					activeTag = thisTag;
					tagStack.push([activeTag, select]);
				}
				continue;
			}
		}
		if (select) selected.push(index + 1);
	}
	return selected;
}

// 官方 #splitDelimitedValue：有逗号按逗号切，否则按分号切；JS 的 split 保留空段（`1;3;` 切出末尾的空串）。
function splitDelimitedValue(value: string): string[] {
	return value.includes(",") ? value.split(",") : value.split(";");
}
