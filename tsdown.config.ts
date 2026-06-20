import { defineConfig } from "tsdown";

export default defineConfig([
	{
		entry: ["src/index.ts", "src/cli.ts", "src/animation-yaml-export/cli.ts"],
		dts: true,
		clean: true,
		format: ["esm"],
		platform: "node",
	},
	{
		entry: ["src/browser.ts"],
		dts: true,
		clean: false,
		format: ["esm"],
		fixedExtension: true,
		platform: "browser",
	},
]);
