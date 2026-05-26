export function definedObject<T extends Record<string, unknown>>(object: T): T {
	return Object.fromEntries(
		Object.entries(object).filter(([, value]) => value !== undefined),
	) as T;
}
