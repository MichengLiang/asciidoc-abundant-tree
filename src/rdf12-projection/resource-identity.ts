import { nameInIri, pathInIri } from "./iri-name";
import { iriTerm, type Rdf12IriTerm } from "./terms";

// 资源的 IRI 分两块（06 号书第 2 章「身份」）：<文档 IRI>#<名字> 只留给标题，名字是作者引用这一节时写的地址；
// 投影器自己起名的资源放在 <文档 IRI>/projection# 下，局部名按行列起。两块分开，名叫 Source 的标题才不会与来源资源
// 成为同一个 IRI。

export type ResourceKind = "xref" | "payload";

export type OrdinalCoordinate = {
	readonly kind: ResourceKind;
	readonly startLine: number;
	readonly startColumn?: number;
};

export type OrdinalAllocator = {
	next(coordinate: OrdinalCoordinate): number;
};

export function documentIriFor(baseIri: string, relativePath: string): string {
	return `${baseIri}${pathInIri(relativePath)}`;
}

export function headingNamespaceFor(documentIri: string): string {
	return `${documentIri}#`;
}

export function headingIri(documentIri: string, name: string): Rdf12IriTerm {
	return iriTerm(`${headingNamespaceFor(documentIri)}${nameInIri(name)}`);
}

export function projectionResourceIri(
	documentIri: string,
	localId: string,
): Rdf12IriTerm {
	return iriTerm(`${documentIri}/projection#${localId}`);
}

export function makePayloadLocalId(input: {
	readonly startLine: number;
	readonly ordinal: number;
}): string {
	return `payload-l${input.startLine}-o${input.ordinal}`;
}

export function makeXrefEdgeResourceLocalId(input: {
	readonly startLine: number;
	readonly startColumn: number;
	readonly ordinal: number;
}): string {
	return `xref-edge-l${input.startLine}-c${input.startColumn}-o${input.ordinal}`;
}

export function createOrdinalAllocator(): OrdinalAllocator {
	const nextOrdinalByCoordinate = new Map<string, number>();

	return {
		next(coordinate) {
			const key = ordinalCoordinateKey(coordinate);
			const ordinal = nextOrdinalByCoordinate.get(key) ?? 0;
			nextOrdinalByCoordinate.set(key, ordinal + 1);
			return ordinal;
		},
	};
}

function ordinalCoordinateKey(coordinate: OrdinalCoordinate): string {
	return JSON.stringify({
		kind: coordinate.kind,
		startLine: coordinate.startLine,
		startColumn: coordinate.startColumn ?? null,
	});
}
