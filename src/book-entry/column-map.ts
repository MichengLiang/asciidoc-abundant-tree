import type { BookEntryDiagnostic } from "./diagnostics";

export type IdentityColumnMap = {
	readonly kind: "identity";
};

export type OffsetColumnMap = {
	readonly kind: "offset";
	readonly logicalStartColumn: number;
	readonly originStartColumn: number;
};

export type UnmappedColumnMap = {
	readonly kind: "unmapped";
	readonly diagnostic: BookEntryDiagnostic;
};

export type ColumnMap = IdentityColumnMap | OffsetColumnMap | UnmappedColumnMap;

export function createIdentityColumnMap(): IdentityColumnMap {
	return { kind: "identity" };
}

export function createIndentOffsetColumnMap(options: {
	readonly insertedColumns: number;
	readonly originStartColumn?: number | undefined;
}): OffsetColumnMap {
	return {
		kind: "offset",
		logicalStartColumn: options.insertedColumns + 1,
		originStartColumn: options.originStartColumn ?? 1,
	};
}

export function createUnmappedColumnMap(
	diagnostic: BookEntryDiagnostic,
): UnmappedColumnMap {
	return { kind: "unmapped", diagnostic };
}

export function lookupOriginColumn(
	columnMap: ColumnMap,
	logicalColumn: number,
): number | undefined {
	if (logicalColumn < 1) {
		return undefined;
	}
	switch (columnMap.kind) {
		case "identity":
			return logicalColumn;
		case "offset":
			if (logicalColumn < columnMap.logicalStartColumn) {
				return undefined;
			}
			return (
				logicalColumn -
				columnMap.logicalStartColumn +
				columnMap.originStartColumn
			);
		case "unmapped":
			return undefined;
	}
}
