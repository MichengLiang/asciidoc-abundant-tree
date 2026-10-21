// 一行是不是开始分隔符、它能开出哪些 context、闭合行是什么，照 Asciidoctor 自己的认法（09 号书「分隔符与它的闭合」）。
// 逐句移植 aat 实际运行的 Asciidoctor.js 4.1.1：Parser.isDelimitedBlock（packages/core/src/parser.js 3056-3098 行，
// Compliance.markdownSyntax 取默认的开启）与 DELIMITED_BLOCKS（constants.js 269-300 行）。官方没有导出 Parser。
const DELIMITED_BLOCKS: Readonly<
	Record<string, readonly [context: string, masq: ReadonlySet<string>]>
> = {
	"--": [
		"open",
		new Set([
			"comment",
			"example",
			"literal",
			"listing",
			"pass",
			"quote",
			"sidebar",
			"source",
			"verse",
			"admonition",
			"abstract",
			"partintro",
		]),
	],
	"----": ["listing", new Set(["literal", "source"])],
	"....": ["literal", new Set(["listing", "source"])],
	"====": ["example", new Set(["admonition"])],
	"****": ["sidebar", new Set()],
	____: ["quote", new Set(["verse"])],
	"++++": ["pass", new Set(["stem", "latexmath", "asciimath"])],
	"|===": ["table", new Set()],
	",===": ["table", new Set()],
	":===": ["table", new Set()],
	"!===": ["table", new Set()],
	"~~~~": ["open", new Set(["abstract", "partintro"])],
	"////": ["comment", new Set()],
	"```": ["fenced_code", new Set()],
};

const DELIMITED_BLOCK_HEADS = new Set(
	Object.keys(DELIMITED_BLOCKS).map((delimiter) => delimiter.slice(0, 2)),
);

// 只有四个字符的分隔符可以加长，加长用的是它的最后一个字符。
const DELIMITED_BLOCK_TAILS: Readonly<Record<string, string>> =
	Object.fromEntries(
		Object.keys(DELIMITED_BLOCKS)
			.filter((delimiter) => delimiter.length === 4)
			.map((delimiter) => [delimiter, delimiter.slice(-1)]),
	);

export type OfficialDelimiter = {
	readonly context: string;
	readonly masq: ReadonlySet<string>;
	readonly terminator: string;
};

// line 是去掉行尾空白的一行，与官方 Reader 交给 isDelimitedBlock 的行相同。
export function officialDelimiter(line: string): OfficialDelimiter | undefined {
	let candidate = line;
	let lineLength = candidate.length;
	if (lineLength < 2 || !DELIMITED_BLOCK_HEADS.has(candidate.slice(0, 2))) {
		return undefined;
	}
	let tip: string;
	let tipLength: number;
	if (lineLength === 2) {
		tip = candidate;
		tipLength = 2;
	} else {
		tipLength = lineLength < 5 ? lineLength : 4;
		tip = candidate.slice(0, tipLength);
		if (tip.startsWith("`")) {
			if (tipLength === 4) {
				if (tip === "````") {
					return undefined;
				}
				tip = tip.slice(0, 3);
				if (tip !== "```") {
					return undefined;
				}
				// ```ruby 的闭合行是 ```，不是整行开始行。
				candidate = tip;
				lineLength = 3;
				tipLength = 3;
			} else if (tip !== "```") {
				return undefined;
			}
		} else if (tipLength === 3) {
			return undefined;
		}
	}
	const entry = DELIMITED_BLOCKS[tip];
	if (!entry) {
		return undefined;
	}
	const tail = DELIMITED_BLOCK_TAILS[tip];
	const isMatch =
		lineLength === tipLength ||
		(tail !== undefined && isUniform(candidate.slice(1), tail));
	if (!isMatch) {
		return undefined;
	}
	const [context, masq] = entry;
	return { context, masq, terminator: candidate };
}

// 块的 context 是分隔符自己的，或是作者用样式让它伪装成的（DELIMITED_BLOCKS 的 masq）。fenced code 在官方建块时
// 落成带 source 样式的 listing（parser.js 1226 行起的 fenced_code 一支）。
export function delimiterOpens(
	delimiter: OfficialDelimiter,
	context: string | undefined,
	style: string | null | undefined,
): boolean {
	if (context === undefined) {
		return false;
	}
	if (delimiter.context === "fenced_code") {
		return context === "listing";
	}
	return (
		delimiter.context === context ||
		delimiter.masq.has(context) ||
		(style !== null && style !== undefined && delimiter.masq.has(style))
	);
}

function isUniform(text: string, character: string): boolean {
	return [...text].every((each) => each === character);
}
