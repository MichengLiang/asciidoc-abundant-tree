export const coldChainPolicy = {
	domain: "cold-chain",
	hierarchy: {
		relation: "governed-by",
		direction: "child-to-parent",
	},
	relations: ["governed-by", "triggers", "has-part", "monitors"],
	roles: ["policy", "shipment", "payload", "sensor", "process"],
};
