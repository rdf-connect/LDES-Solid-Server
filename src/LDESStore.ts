
import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, Conditions, CONTENT_TYPE, guardedStreamFrom, INTERNAL_QUADS, MetadataRecord, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { CacheDirectives, FragmentFetcher, Member, RelationParameters, RelationType } from "@treecg/types";
import { MongoClient } from 'mongodb';
import { DataFactory as DF, Parser, Quad_Object } from 'n3';
import { FragmentFetcherFactory, FragmentFetcherFactoryImpl, HTTP } from "./index";

import { RDF as RDFT, SDS, TREE } from '@treecg/types';
import { cacheToLiteral } from './utils';
import winston from "winston";

const consoleTransport = new winston.transports.Console();
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.label({ label: "LDESStore", message: true }),
        winston.format.colorize({ level: true }),
        winston.format.simple()
    ), transports: [consoleTransport]
});

export type MongoFragment = {
    id?: string,
    streamId: string,
    leaf: boolean,
    value?: string,
    relations: { type: RelationType, value: string, bucket: string, path: string }[],
    members?: string[],
    count: number,
    timeStamp?: string
};

consoleTransport.level = process.env.LOG_LEVEL || "info";

const { namedNode, quad, blankNode, literal } = DF;

interface PrefixFetcher {
    prefix: string,
    fetcher: FragmentFetcher,
}

export class DBConfig {
    readonly url: string;
    readonly dbName?: string;
    readonly meta: string;
    readonly members: string;
    readonly indices: string;
    constructor(metaCollection: string, membersCollection: string, indexCollection: string, dbUrl?: string, dbName?: string) {
        this.meta = metaCollection;
        this.members = membersCollection;
        this.indices = indexCollection;

        this.url = dbUrl || "mongodb://localhost:27017";
        this.dbName = dbName;
    }
}

export class LDESView {
    public readonly mprefix: string;
    public readonly streamId: string;
    constructor(mprefix: string, streamId: string) {
        this.mprefix = mprefix;
        this.streamId = streamId;
    }
}
export class LDESViews {
    public readonly views: LDESView[];
    constructor(views: LDESView[]) {
        this.views = views;
    }
}

export class LDESAccessorBasedStore implements ResourceStore {
    private readonly id: string;
    private readonly fragmentFetchers: PrefixFetcher[];

    constructor(
        id: string,
        views: LDESViews,
        dbConfig: DBConfig,
    ) {
        this.id = id;
        this.fragmentFetchers = [];

        this.createFetchers(new FragmentFetcherFactoryImpl(), views.views, dbConfig);
    }

    private async createFetchers(factory: FragmentFetcherFactory, views: LDESView[], dbConfig: DBConfig) {
        const client = new MongoClient(dbConfig.url);
        await client.connect();
        const db = client.db(dbConfig.dbName);

        const metaCollection = db.collection(dbConfig.meta);
        const membersCollection = db.collection(dbConfig.members);
        const indexCollection = db.collection<MongoFragment>(dbConfig.indices);


        const streams = await metaCollection.find({ "type": SDS.Stream }).toArray();

        for (let stream of streams) {
            const metadata = new Parser().parse(stream.value);

            const config = views.find(config => config.streamId === stream.id);
            if (config) {
                logger.info("adding fragmentation with prefix: " + config.mprefix);
                this.fragmentFetchers.push({
                    prefix: config.mprefix,
                    fetcher: await factory.build(stream.id, metadata, membersCollection, indexCollection),
                })
            } else {
                logger.debug("No fragmentation specified for " + stream.id);
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
        logger.debug("Getting representation for " + identifier.path);
        let index = -1;
        let chosenFetcher = undefined;
        let chosenPrefix = undefined;
        for (let { prefix, fetcher } of this.fragmentFetchers) {
            const competingIndex = identifier.path.indexOf(prefix);
            if (competingIndex < 0 || (index >= 0 && competingIndex >= index)) {
                continue;
            }

            index = competingIndex;
            chosenFetcher = fetcher;
            chosenPrefix = prefix;
        }

        if (!chosenFetcher) {
            throw "No LDES found!"
        }

        logger.debug("Found prefix " + chosenPrefix);
        const baseIdentifier = identifier.path.substring(0, index + chosenPrefix!.length + 1)
        const fragment = await chosenFetcher.fetch(identifier.path.substring(index + chosenPrefix!.length).replace("/", ""), false);
        const quads: Array<RDF.Quad> = [];

        // this is not always correct
        quads.push(quad(
            namedNode(this.id),
            TREE.terms.view,
            namedNode(identifier.path)
        ));

        fragment.relations.forEach(relation => this.addRelations(quads, identifier.path, baseIdentifier, relation));

        fragment.members.forEach(m => this.addMember(quads, m));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
            new RepresentationMetadata(this.getMetadata(fragment.cache))
        );

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
        quads.push(...member.quads);
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
