export type BusinessNode = {
  label: string;
  roles: string[];
  fields: Record<string, string[]>;
  line: string;
};

export type BusinessEdge = {
  source: string;
  relation: string;
  target: string;
  origin: "hierarchy-policy" | "explicit-xref";
  line?: string;
  raw?: string;
};
