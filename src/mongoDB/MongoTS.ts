import type * as Rdf from '@rdfjs/types';
import {ensureTrailingSlash, getLoggerFor, trimTrailingSlashes,} from '@solid/community-server';
import {CacheDirectives, LDES, Member, RDF, RelationParameters, RelationType, TREE} from "@treecg/types";
import {Collection, Db, Filter} from "mongodb";
import {DataFactory, Parser, Store} from "n3";

import {View} from "../ldes/View";
import {Fragment} from "../ldes/Fragment";
import {DBConfig} from "./MongoDBConfig";
import {DataCollectionDocument, IndexCollectionDocument, MetaCollectionDocument} from "./MongoCollectionTypes";
import {MongoTSViewDescription} from "../ldes/viewDescription/MongoTSViewDescription";

const {namedNode, quad, literal} = DataFactory;

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
        return await this.collection.find({id: {$in: this.members}})
            .map(row => {
                return <Member>{id: namedNode(row.id), quads: new Parser().parse(row.data)}
            })
            .toArray();
    }

    async getRelations(): Promise<RelationParameters[]> {
        return this.relations;
    }

    async getCacheDirectives(): Promise<CacheDirectives> {
        return {pub: true};
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

    descriptionId: string;
    streamId: string;


    constructor(db: DBConfig, streamId: string, descriptionId: string) {
        this.dbConfig = db;
        this.streamId = streamId;
        this.descriptionId = descriptionId;
    }

    async init(base: string, prefix: string): Promise<void> {
        this.db = await this.dbConfig.db();
        this.metaCollection = this.db.collection(this.dbConfig.meta);
        this.indexCollection = this.db.collection(this.dbConfig.index);
        this.dataCollection = this.db.collection(this.dbConfig.data);

        this.root = base + ensureTrailingSlash(trimTrailingSlashes(prefix));
    }

    /**
     * The URL of the view of the LDES.
     * @returns {string}
     */
    getRoot(): string {
        return this.root;
    }

    async getMetadata(ldes: string): Promise<Rdf.Quad[]> {
        const quads = []
        const query = {"type": LDES.EventStream, "id": this.streamId}
        const meta = await this.metaCollection.findOne(query);
        if (meta) {
            const metaStore = new Store(new Parser().parse(meta.value))
            const mongoTSVD = new MongoTSViewDescription(this.descriptionId, ldes, this.root);
            const viewDescription = mongoTSVD.parseViewDescription(metaStore)
            quads.push(...viewDescription.quads());
        } else {
            console.log(`No ViewDescription found for`, this.descriptionId)
            console.log(`tried following search query: `, query)
        }

        quads.push(quad(namedNode(ldes), RDF.terms.type, LDES.terms.EventStream));
        quads.push(quad(namedNode(this.getRoot()), RDF.terms.type, TREE.terms.custom("Node"))); // TODO: verify if this makes sense
        return quads;
    }

    async getFragment(identifier: string): Promise<Fragment> {
        this.logger.info(`Looking for fragment with id "${identifier}" in the Mongo Database. (streamID: "${this.streamId}")`);
        console.log(`Looking for fragment with id "${identifier}" in the Mongo Database. (streamID: "${this.streamId}")`)
        const members = [] as string[];
        const relations = <RelationParameters[]>[];
        const search: Filter<IndexCollectionDocument> = {streamId: this.streamId, id: identifier, leaf: true};

        const dbFragment = await this.indexCollection.find(search).sort({"timeStamp": -1}).limit(1).next();
        if (!dbFragment) {
            this.logger.error("No such bucket found! " + JSON.stringify(search));
            console.log("No such bucket found! " + JSON.stringify(search));
        } else {
            members.push(...dbFragment.members || []);

            const rels: RelationParameters[] = dbFragment!.relations.map(({type, value, bucket, path}) => {
                const values: Rdf.Term[] = [literal(value, namedNode("http://www.w3.org/2001/XMLSchema#dateTime"))];
                return {type: <RelationType>type, value: values, nodeId: bucket, path: namedNode(path)};
            });

            relations.push(...rels);
        }
        return new MongoTSFragment(members, relations, this.dataCollection);
    }
}

