export type XrefAuditFinding = {
	kind: "unresolved-xref" | "ambiguous-xref" | "unused-custom-id";
	selector: string;
	relativePath: string;
	line: number;
};
