import type { AsciidoctorBlock } from "./asciidoctor-adapter";

export type OfficialBlockPolicy = "scan" | "skip" | "recurse" | "diagnostic";

// 官方块 context 的全集取自 HTML5 转换器的 convert_* 方法；归类与依据见 09 号书「Inline 扫描边界」。
// 只有不在表里的 context（扩展注册的自定义块）落到 diagnostic：不知道它的内容怎样替换，块与后代都不扫。
export function officialBlockPolicy(
	block: AsciidoctorBlock,
): OfficialBlockPolicy {
	switch (block.getContext?.()) {
		case "admonition":
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
		case "colist":
		// 术语与描述各扫自己的文字；整段扫会把它们之间官方读掉的块标题也扫进去（09 号书「描述的文字」）。
		case "dlist":
		// 文档标题与第一节之间的块，官方装进 preamble 块（parser.js 632-633 行补的就是它的坐标）。
		case "preamble":
		case "section":
		case "ulist":
			return "recurse";
		case "listing":
		case "literal":
		case "pass":
		case "stem":
			return "skip";
		// 没有内容的块（内容模型 empty）。块标题与属性行是 metadata，照样扫；带 ID 的登记为目标。
		case "thematic_break":
		case "page_break":
		case "toc":
		case "image":
		case "audio":
		case "video":
		case "floating_title":
			return "skip";
		default:
			return "diagnostic";
	}
}
