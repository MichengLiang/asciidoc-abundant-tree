export type XrefAuditFinding = {
  kind: "unresolved-xref" | "ambiguous-xref" | "unused-stable-id";
  selector: string;
  relativePath: string;
  line: number;
};
