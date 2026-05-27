export type OfficialBlockPolicy = "scan" | "skip" | "recurse" | "diagnostic";

export function officialBlockPolicy(
	context: string | undefined,
): OfficialBlockPolicy {
	switch (context) {
		case "paragraph":
		case "table":
			return "scan";
		case "section":
		case "open":
			return "recurse";
		case "listing":
		case "literal":
		case "pass":
			return "skip";
		default:
			return "diagnostic";
	}
}
