import { z } from "zod";

export const sourceLocator = z.object({
	pdf: z.object({
		page: z.number(),
		bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
	}),
	textQuote: z.object({
		exact: z.string(),
		prefix: z.string().optional(),
		suffix: z.string().optional(),
	}),
});
