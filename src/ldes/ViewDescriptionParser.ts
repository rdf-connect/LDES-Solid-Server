import {
    BucketizeStrategy,
    IBucketizeStrategy,
    IngestorClient,
    IViewDescription,
    ViewDescription
} from "./ViewDescription";
import {DataFactory, Literal, Parser, Store, Writer} from "n3";
import {LDES, RDF, TREE} from "@treecg/types";
import * as Rdf from "@rdfjs/types";
import namedNode = DataFactory.namedNode;

export class ViewDescriptionParser {
    private viewIdentifier :string;
    private ldesIdentifier :string;

    constructor(viewIdentifier: string, ldesIdentifier: string) {
        this.viewIdentifier = viewIdentifier;
        this.ldesIdentifier = ldesIdentifier;
    }
    /**
     * Parses a selection of an N3 Store to a {@link IViewDescription}.
     *
     * @param store An N3 Store.
     * @param viewDescriptionURI The URI of the View Description in the store.
     * @returns {IViewDescription}
     */
    public parseViewDescription(store: Store, viewDescriptionURI: string): IViewDescription {
        const viewDescriptionNode = namedNode(viewDescriptionURI);
        const managedByIds = store.getObjects(viewDescriptionNode, LDES.custom("managedBy"), null)
        if (managedByIds.length !== 1) {
            throw new Error(`Could not parse view description as the expected amount of managed by identifiers is 1 | received: ${managedByIds.length}`)
        }

        const managedByNode = managedByIds[0]

        const bucketizers = store.getObjects(managedByNode, LDES.custom("bucketizeStrategy"), null)
        if (bucketizers.length !== 1) {
            throw new Error(`Could not parse view description as the expected amount of bucketizers is 1 | received: ${bucketizers.length}`)
        }

        const ingestorTypes =  store.getObjects(managedByNode, RDF.type, null)
        if (ingestorTypes.length !== 1) {
            throw new Error(`Could not parse view description as the expected amount of types for the managed by property is 1 | received: ${ingestorTypes.length}`)
        }
        const bucketizeStrategy = this.parseBucketizeStrategy(store, bucketizers[0])

        const ingestorClient = new IngestorClient(managedByNode.value, bucketizeStrategy, ingestorTypes[0].value)
        return new ViewDescription(viewDescriptionNode.value, ingestorClient, this.ldesIdentifier, this.viewIdentifier)
    }
    protected parseBucketizeStrategy(store: Store, bucketizeStrategyNode: Rdf.Term): IBucketizeStrategy {
        const bucketTypes = store.getObjects(bucketizeStrategyNode, LDES.bucketType, null)
        const treePaths = store.getObjects(bucketizeStrategyNode, TREE.path, null)

        if (bucketTypes.length !== 1) {
            throw new Error(`Could not parse bucketizer in view description as the expected amount of bucket types is 1 | received: ${bucketTypes.length}`)
        }
        if (treePaths.length !== 1) {
            throw new Error(`Could not parse bucketizer in view description as the expected amount of paths is 1 | received: ${treePaths.length}`)
        }
        const bucketType = bucketTypes[0].value
        const path = treePaths[0].value // NOTE: must be same as all tree paths in each Relation!!

        let pageSize: number | undefined
        if (store.getObjects(bucketizeStrategyNode, LDES.custom("pageSize"), null).length === 1) {
            const pageSizeLiteral = store.getObjects(bucketizeStrategyNode, LDES.custom("pageSize"), null)[0] as Literal
            pageSize = parseInt(pageSizeLiteral.value, 10)
            if (isNaN(pageSize)) {
                throw Error("Could not parse bucketizer in view description as the page size is not a number.")
            }
        }
        return new BucketizeStrategy(bucketizeStrategyNode.value, bucketType, path, pageSize)
    }
}

const vd = `@prefix example: <http://www.example.org/ldes#>.
@prefix ldes: <https://w3id.org/ldes#>.
@prefix tree: <https://w3id.org/tree#>.
@prefix dcat: <http://www.w3.org/ns/dcat#>.
@prefix sosa: <http://www.w3.org/ns/sosa/>.
example:viewDescription a tree:viewDescription;
#\tdcat:endpointURL -> the view of the LDES, decided by the server
# \tdcat:servesDataset -> the ldes eventstream, decided by the server
\tldes:managedBy example:memberIngestor .# the entity responsible to maintain the structure of the above mentioned

example:memberIngestor a example:mongoDBTSIngestor; # TODO: properly
    ldes:bucketizeStrategy example:BucketizeStrategy.

example:BucketizeStrategy a ldes:BucketizeStrategy;
    ldes:bucketType ldes:timestampFragmentation;
    tree:path sosa:resultTime; 
    ldes:pageSize 100.`

const parser = new ViewDescriptionParser("http://example.org/view","http://example.org/ldes#eventsream")

const viewDescription = parser.parseViewDescription(new Store(new Parser().parse(vd)),"http://www.example.org/ldes#viewDescription")
console.log(new Writer().quadsToString(viewDescription.getStore().getQuads(null,null,null,null)))
