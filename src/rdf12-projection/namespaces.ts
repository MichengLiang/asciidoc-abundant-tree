export const aat = "https://micheng.dev/ns/asciidoc-abundant-tree#";
export const rel = "https://micheng.dev/ns/asciidoc-relation#";
export const field = "https://micheng.dev/ns/asciidoc-field#";
export const rdf = "http://www.w3.org/1999/02/22-rdf-syntax-ns#";
export const rdfs = "http://www.w3.org/2000/01/rdf-schema#";
export const prov = "http://www.w3.org/ns/prov#";
export const dcterms = "http://purl.org/dc/terms/";
export const xsd = "http://www.w3.org/2001/XMLSchema#";

// 投影结果的 prefixes 字段就是这张表：它的类型写成具名的对象类型，使用方按名字导入它时不必引用这个常量。
export type Rdf12PrefixMap = {
	readonly aat: string;
	readonly rel: string;
	readonly field: string;
	readonly rdf: string;
	readonly rdfs: string;
	readonly prov: string;
	readonly dcterms: string;
	readonly xsd: string;
};

export const namespaces: Rdf12PrefixMap = {
	aat,
	rel,
	field,
	rdf,
	rdfs,
	prov,
	dcterms,
	xsd,
};
