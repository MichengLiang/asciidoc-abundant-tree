import { z } from "zod";

export const releasePolicyConfig = z.object({
	temperatureWindowCelsius: z.object({
		min: z.number(),
		max: z.number(),
	}),
	manualReviewWhen: z.array(z.string()).default([]),
});

export const reviewPlaybook = z.object({
	review_team: z.string(),
	steps: z.array(z.string()),
});

export const dependencyEvidence = z.object({
	source: z.string(),
	required_signals: z.array(z.string()),
	risk_level: z.string(),
	reason: z.string(),
});
