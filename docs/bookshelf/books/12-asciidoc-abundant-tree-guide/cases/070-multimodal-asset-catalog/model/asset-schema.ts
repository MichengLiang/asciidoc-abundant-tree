import { z } from "zod";

export const visionProfile = z.object({
	composition: z.string(),
	dominantColors: z.array(z.string()),
	objects: z.array(z.string()),
});
