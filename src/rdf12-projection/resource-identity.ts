import { pathInIri } from "./iri-name";
import { iriTerm, type Rdf12IriTerm } from "./terms";

// 每个资源的 IRI 都是 <文档 IRI>#<局部名>，局部名由投影器按资源类别与位置起，不含作者写的字符串（06 号书第 2 章
// 「身份」）：作者的字符串会重名，拿它当身份，投影器就得替下游判断谁和谁重复。各类局部名的前缀互不相交。

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

export function documentResourceIri(
	documentIri: string,
	localId: string,
): Rdf12IriTerm {
	return iriTerm(`${documentIri}#${localId}`);
}

// 标题按 aat:documentOrder 起名：它本来就是标题的事实，整份文档内唯一、从 1 连续，不需要去冲突的规则；
// 行号在 book-entry 下跨文件相撞，单用行号不行。
export function makeHeadingLocalId(documentOrder: number): string {
	return `heading-${documentOrder}`;
}

export function makePayloadLocalId(input: {
	readonly startLine: number;
	readonly ordinal: number;
}): string {
	return `payload-l${input.startLine}-o${input.ordinal}`;
}

// 字段证据按所属标题的 documentOrder 与字段在标题内的顺序起名，不用行号：理由同标题（06 号书第 6 章「字段证据」）。
export function makeFieldEvidenceLocalId(input: {
	readonly documentOrder: number;
	readonly fieldOrder: number;
}): string {
	return `field-evidence-${input.documentOrder}-${input.fieldOrder}`;
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
