export const queries = {
  headingsByDocumentOrder: `
    PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
    SELECT ?heading ?headline ?order WHERE {
      ?heading a aat:Heading ;
               aat:headline ?headline ;
               aat:documentOrder ?order .
    }
    ORDER BY ?order
  `,
  xrefEvidence: `
    PREFIX aat: <https://micheng.dev/ns/asciidoc-abundant-tree#>
    SELECT ?edge ?raw ?line WHERE {
      ?edge a aat:XrefEdge ;
            aat:raw ?raw ;
            aat:startLine ?line .
    }
    ORDER BY ?line
  `,
};
