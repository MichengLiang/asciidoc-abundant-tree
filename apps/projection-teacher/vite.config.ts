import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const browserEntry = fileURLToPath(
	new URL("../../src/browser.ts", import.meta.url),
);

export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"asciidoc-abundant-tree/browser": browserEntry,
		},
	},
	server: {
		host: "127.0.0.1",
	},
});
