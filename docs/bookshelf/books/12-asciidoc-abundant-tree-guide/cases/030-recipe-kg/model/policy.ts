export const recipePolicy = {
	domain: "recipe",
	hierarchy: {
		relation: "part-of",
		direction: "child-to-parent",
	},
	relations: ["is-a", "part-of"],
	roles: ["recipe", "ingredient", "step", "category"],
};
