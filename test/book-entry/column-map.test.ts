import { describe, expect, it } from "vitest";
import {
	createIdentityColumnMap,
	createIndentOffsetColumnMap,
	createUnmappedColumnMap,
	lookupOriginColumn,
} from "../../src/book-entry/column-map";

describe("book-entry column map", () => {
	it("maps identity columns without shifting", () => {
		expect(lookupOriginColumn(createIdentityColumnMap(), 7)).toBe(7);
	});

	it("maps indented content columns back to origin columns", () => {
		const map = createIndentOffsetColumnMap({
			insertedColumns: 2,
			originStartColumn: 1,
		});

		expect(lookupOriginColumn(map, 3)).toBe(1);
		expect(lookupOriginColumn(map, 6)).toBe(4);
	});

	it("does not map columns inserted by indentation", () => {
		const map = createIndentOffsetColumnMap({
			insertedColumns: 2,
			originStartColumn: 1,
		});

		expect(lookupOriginColumn(map, 1)).toBeUndefined();
		expect(lookupOriginColumn(map, 2)).toBeUndefined();
	});

	it("blocks precise output for unmapped columns", () => {
		const map = createUnmappedColumnMap({
			level: "warning",
			code: "source-coordinate.column-unmapped",
			message: "Column cannot be mapped.",
		});

		expect(lookupOriginColumn(map, 1)).toBeUndefined();
		expect(map.diagnostic.code).toBe("source-coordinate.column-unmapped");
	});
});
