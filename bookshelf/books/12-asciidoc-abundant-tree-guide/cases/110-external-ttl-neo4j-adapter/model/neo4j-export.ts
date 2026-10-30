export type Neo4jNodeRow = {
	id: string;
	label: string;
	sourceLine: number;
};

export type Neo4jRelationshipRow = {
	startId: string;
	type: string;
	endId: string;
};
