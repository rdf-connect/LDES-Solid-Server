import {Store} from "n3";
import {BucketizeStrategy, IngestorClient, IViewDescription, ViewDescription} from "./ViewDescription";
import {ViewDescriptionParser} from "./ViewDescriptionParser";

export class MongoTSViewDescription {
    private viewDescriptionIdentifier: string;
    private ldesIdentifier: string;

    constructor(viewDescriptionIdentifier: string, ldesIdentifier: string) {
        this.viewDescriptionIdentifier = viewDescriptionIdentifier;
        this.ldesIdentifier = ldesIdentifier;
    }

    public parseViewDescription(store: Store): IViewDescription{
        const parser =  new ViewDescriptionParser('dummy','dummy');
        return parser.parseViewDescription(store,this.viewDescriptionIdentifier);
    }

    public generateViewDescription(options: {timestampPath: string, pageSize?:number}): IViewDescription {
        const ingestorClientType = "http://www.example.org/ldes#mongoDBTSIngestor"
        const bucketizationType = "https://w3id.org/ldes#LDESTSFragmentation"

        const bucketStrategy = new BucketizeStrategy(this.bucketID(), bucketizationType, options.timestampPath, options.pageSize)
        const ingestorClient = new IngestorClient(this.ingestorID(), bucketStrategy, ingestorClientType)
        // eventStreamIdentifier en rootNodeIdentifier are not important for generating this viewDescription
        // as this is normally added within the LDES solid server.
        return new ViewDescription(this.viewDescriptionIdentifier, ingestorClient, this.ldesIdentifier, "dummy")
    }

    private viewDescriptionNamespace(): string {
        const viewDescriptionURL = new URL(this.viewDescriptionIdentifier)
        return viewDescriptionURL.origin + viewDescriptionURL.pathname + '#'
    }
    private bucketID(): string {
        return this.viewDescriptionNamespace() + 'bucketizationStrategy'
    }

    private ingestorID(): string {
        return this.viewDescriptionNamespace() + 'ingestor'
    }
}
