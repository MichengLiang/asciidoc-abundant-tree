export type ColdChainEdge = {
	source: string;
	relation: "governed-by" | "has-part" | "monitors" | "triggers";
	target: string;
	attributes: Record<string, string>;
	line: string;
};
