export type SourceIdentityApi = {
	normalize(path: string): string;
	resolve(path: string): string;
	isAbsolute(path: string): boolean;
	join(...paths: string[]): string;
	basename(path: string): string;
};
