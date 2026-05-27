import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ResourceKind =
	| "document"
	| "section"
	| "paragraph"
	| "listing"
	| "table"
	| "anchor"
	| "xref"
	| "payload"
	| "attribute"
	| "label"
	| "projection"
	| "activity"
	| "source";

export type ResourceIriInput = {
	readonly baseIri: string;
	readonly documentKey: string;
	readonly localId: string;
};

export type BlockLocalIdInput = {
	readonly kind: ResourceKind;
	readonly startLine: number;
	readonly ordinal: number;
};

export type OccurrenceLocalIdInput = BlockLocalIdInput & {
	readonly startColumn: number;
};

export type OrdinalCoordinate = {
	readonly kind: ResourceKind;
	readonly startLine: number;
	readonly startColumn?: number;
};

export type OrdinalAllocator = {
	next(coordinate: OrdinalCoordinate): number;
};

export function makeResourceIri(input: ResourceIriInput): Rdf12IriTerm {
	return iriTerm(`${input.baseIri}${input.documentKey}#${input.localId}`);
}

export function makeBlockResourceLocalId(input: BlockLocalIdInput): string {
	return `${input.kind}-l${input.startLine}-o${input.ordinal}`;
}

export function makeOccurrenceResourceLocalId(
	input: OccurrenceLocalIdInput,
): string {
	return `${input.kind}-l${input.startLine}-c${input.startColumn}-o${input.ordinal}`;
}

export function documentResourceLocalId(): string {
	return "document";
}

export function makeLabelLocalId(input: {
	readonly startLine: number;
	readonly ordinal: number;
}): string {
	return `label-l${input.startLine}-o${input.ordinal}`;
}

export function makeAttributeLocalId(input: {
	readonly startLine: number;
	readonly ordinal: number;
}): string {
	return `attribute-l${input.startLine}-o${input.ordinal}`;
}

export function makeProjectionLocalId(): string {
	return "projection";
}

export function makeActivityLocalId(): string {
	return "activity";
}

export function makeSourceLocalId(): string {
	return "source";
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
