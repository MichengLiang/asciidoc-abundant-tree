import { z } from "zod";

export const k8sManifest = z.object({
	apiVersion: z.string(),
	kind: z.string(),
	metadata: z.object({ name: z.string() }),
});
