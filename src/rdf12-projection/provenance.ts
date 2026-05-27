import type { Rdf12Graph } from "./graph";
import { rdf12Triple } from "./graph";
import { stringLiteral } from "./literals";
import { namespaces } from "./namespaces";
import { iriTerm, type Rdf12IriTerm } from "./terms";

export type ProvenanceResourceIris = {
	readonly sourceDocumentIri: Rdf12IriTerm;
	readonly projectionIri: Rdf12IriTerm;
	readonly projectionActivityIri: Rdf12IriTerm;
	readonly abundantDocumentIri: Rdf12IriTerm;
};

export type AddProvenanceTriplesInput = ProvenanceResourceIris & {
	readonly graph: Rdf12Graph;
	readonly relativePath: string;
	readonly sourceDigest?: string;
};

export function addProvenanceTriples(input: AddProvenanceTriplesInput): void {
	const rdfType = iriTerm(`${namespaces.rdf}type`);
	const provEntity = iriTerm(`${namespaces.prov}Entity`);
	const provActivity = iriTerm(`${namespaces.prov}Activity`);
	const wasDerivedFrom = iriTerm(`${namespaces.prov}wasDerivedFrom`);
	const hadPrimarySource = iriTerm(`${namespaces.prov}hadPrimarySource`);
	const wasGeneratedBy = iriTerm(`${namespaces.prov}wasGeneratedBy`);
	const used = iriTerm(`${namespaces.prov}used`);
	const dctermsSource = iriTerm(`${namespaces.dcterms}source`);
	const relativePath = iriTerm(`${namespaces.aat}relativePath`);

	input.graph.add(rdf12Triple(input.sourceDocumentIri, rdfType, provEntity));
	input.graph.add(
		rdf12Triple(
			input.sourceDocumentIri,
			rdfType,
			iriTerm(`${namespaces.aat}AsciiDocSourceDocument`),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.sourceDocumentIri,
			relativePath,
			stringLiteral(input.relativePath),
		),
	);

	if (input.sourceDigest !== undefined) {
		input.graph.add(
			rdf12Triple(
				input.sourceDocumentIri,
				iriTerm(`${namespaces.aat}sourceDigest`),
				stringLiteral(input.sourceDigest),
			),
		);
	}

	input.graph.add(rdf12Triple(input.projectionIri, rdfType, provEntity));
	input.graph.add(
		rdf12Triple(
			input.projectionIri,
			rdfType,
			iriTerm(`${namespaces.aat}RdfProjection`),
		),
	);
	input.graph.add(
		rdf12Triple(input.projectionIri, wasDerivedFrom, input.sourceDocumentIri),
	);
	input.graph.add(
		rdf12Triple(input.projectionIri, hadPrimarySource, input.sourceDocumentIri),
	);
	input.graph.add(
		rdf12Triple(
			input.projectionIri,
			wasGeneratedBy,
			input.projectionActivityIri,
		),
	);
	input.graph.add(
		rdf12Triple(input.projectionIri, dctermsSource, input.sourceDocumentIri),
	);

	input.graph.add(
		rdf12Triple(input.projectionActivityIri, rdfType, provActivity),
	);
	input.graph.add(
		rdf12Triple(
			input.projectionActivityIri,
			rdfType,
			iriTerm(`${namespaces.aat}ProjectionActivity`),
		),
	);
	input.graph.add(
		rdf12Triple(input.projectionActivityIri, used, input.sourceDocumentIri),
	);
	input.graph.add(
		rdf12Triple(input.projectionActivityIri, used, input.abundantDocumentIri),
	);

	input.graph.add(rdf12Triple(input.abundantDocumentIri, rdfType, provEntity));
	input.graph.add(
		rdf12Triple(
			input.abundantDocumentIri,
			rdfType,
			iriTerm(`${namespaces.aat}AbundantDocument`),
		),
	);
	input.graph.add(
		rdf12Triple(
			input.abundantDocumentIri,
			wasDerivedFrom,
			input.sourceDocumentIri,
		),
	);
}
