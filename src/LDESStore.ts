
import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, Conditions, CONTENT_TYPE, guardedStreamFrom, INTERNAL_QUADS, MetadataRecord, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { CacheDirectives, FragmentFetcher, Member, RelationParameters } from "@treecg/types";
import { MongoClient } from 'mongodb';
import { DataFactory as DF, NamedNode, Parser, Quad_Object } from 'n3';
import { FragmentFetcherFactory, HTTP } from "./index";

import { LDES, RDF as RDFT, SDS, TREE } from '@treecg/types';
import { cacheToLiteral, Data, extractData } from './utils';

const { namedNode, quad, blankNode, literal } = DF;

interface PrefixFetcher {
    prefix: string,
    fetcher: FragmentFetcher,
}

export interface DBConfig {
    url?: string,
    dbName?: string,
    meta: string,
    members: string,
    indices: string
}

export interface LDESConfig {
    id: string,
    prefix: string,
}

export class LDESAccessorBasedStore implements ResourceStore {
    private readonly id: string;
    private readonly fragmentFetchers: PrefixFetcher[];
    private metadata: Data = {};
    private timestampCapable = false;
    private timestampPath?: RDF.Term;
    private readonly ignoredFields: NamedNode[];

    constructor(
        id: string,
        fragmentFetcherFactory: FragmentFetcherFactory,
        ldesConfig: { [label: string]: string },
        dbConfig: DBConfig,
    ) {
        this.id = id;
        this.fragmentFetchers = [];
        this.ignoredFields = [];

        const configs: LDESConfig[] = [];
        for (let label in ldesConfig) {
            configs.push({ id: ldesConfig[label], prefix: label });
        }

        this.createFetchers(fragmentFetcherFactory, configs, dbConfig);
    }

    private async createFetchers(factory: FragmentFetcherFactory, configs: LDESConfig[], dbConfig: DBConfig) {
        const client = new MongoClient(dbConfig.url || "mongodb://localhost:27017");
        await client.connect();
        const db = client.db(dbConfig.dbName);

        const metaCollection = db.collection(dbConfig.meta);
        const membersCollection = db.collection(dbConfig.members);
        const indexCollection = db.collection(dbConfig.indices);


        const metadatas = await metaCollection.find({ "type": SDS.Stream }).toArray();
        if (metadatas.length > 1) {
            console.error("Hm found multiple metadata's in mongo");
        }

        if (metadatas.length > 0) {
            const metadata = new Parser().parse(metadatas[0].value);
            const data = extractData(metadata);
            this.metadata = data;

            if (this.metadata.dataset) {
                const { id, quads } = this.metadata.dataset;

                const timestampPath = quads.find(quad => quad.subject.equals(id) && quad.predicate.equals(LDES.terms.timestampPath));
                this.timestampPath = timestampPath?.object;
                this.timestampCapable = !!timestampPath;
            }
        }

        const fragmentations = await metaCollection.find({ "type": "fragmentation" }).map(row => { return <Member>{ id: namedNode(row.id), quads: new Parser().parse(row.value) } }).toArray();

        for (let fragmentation of fragmentations) {
            const bucketProperty = fragmentation.quads.find(quad => quad.subject.equals(fragmentation.id) && quad.predicate.equals(LDES.terms.bucketProperty))?.object;
            this.ignoredFields.push(<NamedNode>bucketProperty || LDES.terms.bucket);

            const config = configs.find(config => config.id === fragmentation.id.value);
            if (config) {
                console.log("adding fragmentation with prefix", config.prefix);
                this.fragmentFetchers.push({
                    prefix: config.prefix,
                    fetcher: await factory.build(fragmentation.id.value, fragmentation.quads, membersCollection, <any>indexCollection)
                })
            }
        }
    }


    resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
        return false;
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return { [CONTENT_TYPE]: INTERNAL_QUADS };

        const cacheLit = cacheToLiteral(cache);
        return { [HTTP.cache_control]: literal(cacheLit), [CONTENT_TYPE]: INTERNAL_QUADS };
    }

    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions): Promise<Representation> => {
        console.log("Getting representation for ", identifier);
        for (let { prefix, fetcher } of this.fragmentFetchers) {
            const index = identifier.path.indexOf(prefix);
            if (index < 0) {
                continue
            }

            const baseIdentifier = identifier.path.substring(0, index + prefix.length + 1);
            const fragment = await fetcher.fetch(identifier.path.substring(index + prefix.length + 1), this.timestampCapable, this.timestampPath);
            const quads: Array<RDF.Quad> = [];

            // this is not always correct
            quads.push(quad(
                namedNode(this.id),
                TREE.terms.view,
                namedNode(identifier.path)
            ));

            this.addMeta(quads, this.metadata);

            fragment.relations.forEach(relation => this.addRelations(quads, identifier.path, baseIdentifier, relation));
            fragment.members.forEach(m => this.addMember(quads, m));

            return new BasicRepresentation(
                guardedStreamFrom(quads),
                new RepresentationMetadata(this.getMetadata(fragment.cache))
            );
        }

        throw "No LDES found!"
    }

    addRelations(quads: Array<RDF.Quad>, identifier: string, baseIdentifier: string, relation: RelationParameters) {
        const bn = blankNode();
        quads.push(quad(
            namedNode(identifier),
            TREE.terms.relation,
            bn
        ));

        quads.push(quad(
            bn,
            RDFT.terms.type,
            namedNode(relation.type)
        ))

        quads.push(quad(
            bn,
            TREE.terms.node,
            namedNode(baseIdentifier + relation.nodeId)
        ))

        if (relation.path)
            quads.push(quad(
                bn,
                TREE.terms.path,
                <RDF.Quad_Object>relation.path
            ))

        if (relation.value)
            relation.value.forEach(value =>
                quads.push(quad(
                    bn,
                    TREE.terms.value,
                    <RDF.Quad_Object>value
                ))
            )
    }

    addMember(quads: Array<RDF.Quad>, member: Member) {
        quads.push(quad(
            namedNode(this.id),
            TREE.terms.member,
            <Quad_Object>member.id
        ));
        quads.push(...member.quads.filter(quad => !quad.subject.equals(member.id) || !this.ignoredFields.some(ignored => ignored.equals(quad.predicate))));
    }

    addMeta(quads: Array<RDF.Quad>, meta: Data) {
        if (meta.dataset) {
            const datasetId = meta.dataset.id;
            for (let q of meta.dataset.quads) {
                if (q.subject.equals(datasetId)) {
                    q = quad(namedNode(this.id), q.predicate, q.object, q.graph);
                }

                quads.push(q);
            }
        }
    }

    setRepresentation = async (identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
        console.log("Set representation", identifier, representation, conditions)
        throw "Not implemented set"
    }

    addResource = async (container: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier> => {
        console.log("Add representation", container, representation, conditions)
        throw "Not implemented add"
    }

    deleteResource = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
        console.log("Delete representation", identifier, conditions)
        throw "Not implemented delete"
    }

    modifyResource = async (identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
        console.log("Modify representation", identifier, patch, conditions)
        throw "Not implemented modify"
    }
}
