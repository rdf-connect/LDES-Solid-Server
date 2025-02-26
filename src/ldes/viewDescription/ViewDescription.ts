import { DataFactory, Store } from "n3";
import { LDES, TREE } from "@treecg/types";
import { RDF } from "@solid/community-server";
import { DCAT } from "../../util/Vocabulary";
import type * as Rdf from "@rdfjs/types";

const { namedNode, literal } = DataFactory;

export interface N3Support {
    getStore: () => Store;
}

/**
 * An interface that holds the properties for a `tree:ViewDescription`
 * (https://github.com/Informatievlaanderen/OSLOthema-ldes/issues/4).
 */
export interface IViewDescription extends N3Support {
    id: string;
    /**
     * Property that holds the client that is responsible to maintain the structure of this view.
     * `ldes:managedBy`
     */
    managedBy: IIngestorClient;
    /**
     * Property that holds the URI of the LDES.
     * `dcat:serversDataset` (see DCAT 3 §6.9.3)
     */
    servesDataset: string;
    /**
     * Property that holds the URI of an LDES view (the root `tree:node`).
     * `dcat:serversDataset` (see DCAT 3 §6.9.1)
     */
    endpointURL: string;

    quads: () => Rdf.Quad[];
}

/**
 * An interface that holds the properties for an IngestorClient.
 * Such client is responsible for creating this view in an LDES.
 */
export interface IIngestorClient extends N3Support {
    id: string;
    /**
     * Property that holds the bucketization strategy of the view.
     */
    bucketizeStrategy: IBucketizeStrategy;
    /**
     * Type of the IngestorClient client
     */
    type: string;
}

/**
 * An interface that holds the properties for a `ldes:BucketizeStrategy` (
 * https://github.com/ajuvercr/sds-processors/blob/master/bucketizeStrategy.ttl and
 * https://github.com/Informatievlaanderen/OSLOthema-ldes/issues/4).
 */
export interface IBucketizeStrategy extends N3Support {
    id: string;
    bucketType: string;
    path: string; // should be SHACLPath
    pageSize?: number;
}

export class ViewDescription implements IViewDescription {
    constructor(
        id: string,
        managedBy: IIngestorClient,
        eventStreamIdentifier: string,
        rootNodeIdentifier: string,
    ) {
        this._id = id;
        this._managedBy = managedBy;
        this._servesDataset = eventStreamIdentifier;
        this._endpointURL = rootNodeIdentifier;
    }

    private _id: string;

    get id(): string {
        return this._id;
    }

    private _managedBy: IIngestorClient;

    get managedBy(): IIngestorClient {
        return this._managedBy;
    }

    private _servesDataset: string;

    get servesDataset(): string {
        return this._servesDataset;
    }

    private _endpointURL: string;

    get endpointURL(): string {
        return this._endpointURL;
    }

    getStore(): Store {
        const store = new Store();
        store.addQuad(
            namedNode(this.id),
            RDF.terms.type,
            TREE.terms.custom("ViewDescription"),
        );
        store.addQuad(
            namedNode(this.id),
            DCAT.terms.servesDataset,
            namedNode(this.servesDataset),
        );
        store.addQuad(
            namedNode(this.id),
            DCAT.terms.endpointURL,
            namedNode(this.endpointURL),
        );

        store.addQuad(
            namedNode(this.id),
            LDES.terms.custom("managedBy"),
            namedNode(this.managedBy.id),
        );
        store.addQuads(
            this.managedBy.getStore().getQuads(null, null, null, null),
        );
        return store;
    }

    quads(): Rdf.Quad[] {
        return this.getStore().getQuads(null, null, null, null);
    }
}

export class IngestorClient implements IIngestorClient {
    constructor(
        id: string,
        bucketizeStrategy: IBucketizeStrategy,
        type: string,
    ) {
        this._bucketizeStrategy = bucketizeStrategy;
        this._id = id;
        this._type = type;
    }

    private _bucketizeStrategy: IBucketizeStrategy;

    get bucketizeStrategy(): IBucketizeStrategy {
        return this._bucketizeStrategy;
    }

    private _id: string;

    get id(): string {
        return this._id;
    }

    private _type: string;

    get type(): string {
        return this._type;
    }

    getStore(): Store {
        const store = new Store();
        store.addQuad(namedNode(this.id), RDF.terms.type, namedNode(this.type));
        store.addQuad(
            namedNode(this.id),
            LDES.terms.custom("bucketizeStrategy"),
            namedNode(this.bucketizeStrategy.id),
        );

        store.addQuads(
            this.bucketizeStrategy.getStore().getQuads(null, null, null, null),
        );
        return store;
    }
}

export class BucketizeStrategy implements IBucketizeStrategy {
    constructor(
        id: string,
        bucketType: string,
        path: string,
        pageSize?: number,
    ) {
        this._bucketType = bucketType;
        this._id = id;
        this._pageSize = pageSize;
        this._path = path;
    }

    private _bucketType: string;

    get bucketType(): string {
        return this._bucketType;
    }

    private _id: string;

    get id(): string {
        return this._id;
    }

    private _pageSize: number | undefined;

    get pageSize(): number | undefined {
        return this._pageSize;
    }

    private _path: string;

    get path(): string {
        return this._path;
    }

    getStore(): Store {
        const store = new Store();
        store.addQuad(
            namedNode(this.id),
            RDF.terms.type,
            LDES.terms.BucketizeStrategy,
        );
        store.addQuad(
            namedNode(this.id),
            LDES.terms.bucketType,
            namedNode(this.bucketType),
        );
        store.addQuad(
            namedNode(this.id),
            TREE.terms.path,
            namedNode(this.path),
        );
        if (this.pageSize) {
            store.addQuad(
                namedNode(this.id),
                LDES.terms.custom("pageSize"),
                literal(this.pageSize),
            );
        }
        return store;
    }
}
