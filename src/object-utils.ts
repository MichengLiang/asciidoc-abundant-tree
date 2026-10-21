// 公共模型里的缺值一律省略字段（09 号书「工程承载」）。Asciidoctor 4.x 的 getTitle、getStyle、getAttribute
// 缺值时返回 null，所以 null 与 undefined 同样省略。
export function definedObject<T extends Record<string, unknown>>(object: T): T {
	return Object.fromEntries(
		Object.entries(object).filter(
			([, value]) => value !== undefined && value !== null,
		),
	) as T;
}
