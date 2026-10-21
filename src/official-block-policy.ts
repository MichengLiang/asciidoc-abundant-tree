import type { AsciidoctorBlock } from "./asciidoctor-adapter";

export type OfficialBlockPolicy = "scan" | "skip" | "recurse" | "diagnostic";

export function officialBlockPolicy(
	block: AsciidoctorBlock,
): OfficialBlockPolicy {
	switch (block.getContext?.()) {
		case "admonition":
		case "dlist":
		case "list_item":
		case "paragraph":
		case "table":
		case "verse":
			return "scan";
		case "example":
		case "quote":
		case "sidebar":
		case "open":
			// 写成隐身段落的这几种块，官方建块时把内容模型从 compound 改成 simple（parser.js 1523 行）：
			// 它装的是一段文字，没有段落子块可以递归（09 号书「Inline 扫描边界」）。
			return block.getContentModel?.() === "simple" ? "scan" : "recurse";
		case "olist":
		case "section":
		case "ulist":
			return "recurse";
		case "listing":
		case "literal":
		case "pass":
		case "stem":
			return "skip";
		default:
			return "diagnostic";
	}
}
