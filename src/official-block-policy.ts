export type OfficialBlockPolicy = "scan" | "skip" | "recurse" | "diagnostic";

export function officialBlockPolicy(
	context: string | undefined,
): OfficialBlockPolicy {
	switch (context) {
		case "admonition":
		case "dlist":
		case "list_item":
		case "paragraph":
		case "preamble":
		case "table":
		case "verse":
			return "scan";
		case "example":
		case "olist":
		case "quote":
		case "section":
		case "sidebar":
		case "ulist":
		case "open":
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
