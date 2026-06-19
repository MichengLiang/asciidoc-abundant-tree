export const fixturePolicies = [
	{
		key: "recipe-knowledge-dlist",
		domain: "recipe",
		title: "家庭食材与菜谱知识库：组成层级 + 描述列表字段",
		fixture: "recipe-knowledge-dlist.adoc",
		hierarchy: {
			relation: "part-of",
			direction: "child-to-parent",
			description: "标题层级表示组成关系，子标题是父标题的组成部分。",
		},
	},
	{
		key: "cold-chain-operations-attrlist",
		domain: "cold-chain",
		title: "冷链药品运输知识库：规则约束层级 + attrlist 字段",
		fixture: "cold-chain-operations-attrlist.adoc",
		hierarchy: {
			relation: "governed-by",
			direction: "child-to-parent",
			description: "标题层级表示规则约束，子标题受父标题约束。",
		},
	},
];

export const domains = [
	{
		key: "recipe",
		title: "家庭食材与菜谱知识库",
		viewRelations: {
			classification: ["is-a"],
			composition: ["uses", "has-step", "part-of", "has-part"],
			overview: ["is-a", "uses", "has-step", "part-of", "has-part"],
		},
	},
	{
		key: "cold-chain",
		title: "冷链药品运输知识库",
		viewRelations: {
			composition: ["part-of", "has-part"],
			rules: ["governed-by", "monitors", "triggers"],
			overview: ["part-of", "has-part", "governed-by", "monitors", "triggers"],
		},
	},
];
