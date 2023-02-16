import type * as RDF from '@rdfjs/types';
import {createUriAndTermNamespace, getLoggerFor, WinstonLogger} from '@solid/community-server';
import { Member, RelationParameters, RelationType, SDS, RDF as RDFT, TREE, CacheDirectives, LDES } from "@treecg/types";
import { Collection, Db, Filter } from "mongodb";
import { DataFactory, Parser } from "n3";

import { View } from "../ldes/View";
import {Fragment} from "../ldes/Fragment";
import {DBConfig} from "./MongoDBConfig";
import {DataCollectionDocument, IndexCollectionDocument, MetaCollectionDocument} from "./MongoCollectionTypes";

const DCAT = createUriAndTermNamespace("http://www.w3.org/ns/dcat#", "endpointURL", "servesDataset");
const { namedNode, quad, blankNode, literal } = DataFactory;

class MongoTSFragment implements Fragment {
    members: string[];
    relations: RelationParameters[];
    collection: Collection<DataCollectionDocument>;
    constructor(members: string[], relations: RelationParameters[], collection: Collection<DataCollectionDocument>) {
        this.collection = collection;
        this.members = members;
        this.relations = relations;
    }

    async getMembers(): Promise<Member[]> {
        return await this.collection.find({ id: { $in: this.members } })
            .map(row => { return <Member>{ id: namedNode(row.id), quads: new Parser().parse(row.data) } })
            .toArray();
    }

    async getRelations(): Promise<RelationParameters[]> {
        return this.relations;
    }

    async getCacheDirectives(): Promise<CacheDirectives> {
        return { pub: true };
    }
}

export class MongoTSView implements View {
    protected readonly logger = getLoggerFor(this);

    dbConfig: DBConfig;
    db!: Db;
    metaCollection!: Collection<MetaCollectionDocument>;
    indexCollection!: Collection<IndexCollectionDocument>;
    dataCollection!: Collection<DataCollectionDocument>;
    root!: string;

    descriptionId?: string;
    streamId: string;


    constructor(db: DBConfig, streamId: string, descriptionId?: string) {
        this.dbConfig = db;
        this.streamId = streamId;
        this.descriptionId = descriptionId;
    }

    async init(base: string, prefix: string): Promise<void> {
        this.db = await this.dbConfig.db();
        this.metaCollection = this.db.collection(this.dbConfig.meta);
        this.indexCollection = this.db.collection(this.dbConfig.index);
        this.dataCollection = this.db.collection(this.dbConfig.data);

        this.root = [base.replace(/^\/|\/$/g, ""), prefix.replace(/^\/|\/$/g, ""),""].join("/");
    }

    getRoot(): string {
        return this.root;
    }

    async getMetadata(ldes: string): Promise<RDF.Quad[]> {
        const quads = [];
        const blankId = this.descriptionId ? namedNode(this.descriptionId) : blankNode();
        quads.push(
            quad(blankId, RDFT.terms.type, TREE.terms.custom("ViewDescription")),
            quad(blankId, DCAT.terms.endpointURL, namedNode(this.getRoot())),
            quad(blankId, DCAT.terms.servesDataset, namedNode(ldes)),
        );

        const stream = await this.metaCollection.findOne({ "type": SDS.Stream, "id": this.streamId });
        if (stream) {
            quads.push(
                quad(blankId, LDES.terms.custom("managedBy"), namedNode(this.streamId)),
            );
            quads.push(...new Parser().parse(stream.value));
        }

        return quads;
    }

    async getFragment(identifier: string): Promise<Fragment> {
        this.logger.info(`Looking for fragment with id "${identifier}" in the Mongo Database. (streamID: "${this.streamId}"`);
        console.log(`Looking for fragment with id "${identifier}" in the Mongo Database. (streamID: "${this.streamId}"`)
        const members = [] as string[];
        const relations = <RelationParameters[]>[];
        const search: Filter<IndexCollectionDocument> = { streamId: this.streamId, id: identifier, leaf: true };

        const dbFragment = await this.indexCollection.find(search).sort({ "timeStamp": -1 }).limit(1).next();
        if (!dbFragment) {
            this.logger.error("No such bucket found! " + JSON.stringify(search));
            console.log("No such bucket found! " + JSON.stringify(search));
        } else {
            members.push(...dbFragment.members || []);

            const rels: RelationParameters[] = dbFragment!.relations.map(({ type, value, bucket, path }) => {
                const values: RDF.Term[] = [literal(value)];
                return { type: <RelationType>type, value: values, nodeId: bucket, path: namedNode(path) };
            });

            relations.push(...rels);
        }

        return new MongoTSFragment(members, relations, this.dataCollection);
    }
}

