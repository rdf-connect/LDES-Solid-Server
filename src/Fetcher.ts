import type * as RDF from '@rdfjs/types';
import { LDES, TREE, Fragment, FragmentFetcher, Member, RelationParameters, RelationType } from "@treecg/types";
import { Collection, Document, Filter } from "mongodb";
import { DataFactory, Parser } from "n3";
import winston from "winston";

const consoleTransport = new winston.transports.Console();
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.label({label: "Fetcher", message: true}),
        winston.format.colorize({ level: true }),
        winston.format.simple()
    ), transports: [consoleTransport]
});
const { namedNode, literal } = DataFactory;

export interface FragmentFetcherFactory {
    build(id: string, store: RDF.Quad[], membersCollection: Collection, indexCollection: Collection<MongoFragment>): Promise<FragmentFetcher>;
}

function findQuads(quads: RDF.Quad[], id: RDF.Term | null, predicate: RDF.Term): RDF.Quad[] {
    if (id) {
        return quads.filter(quad => quad.subject.equals(id) && quad.predicate.equals(predicate));
    } else {
        return quads.filter(quad => quad.predicate.equals(predicate));
    }
}

export class FragmentFetcherFactoryImpl implements FragmentFetcherFactory {
    async build(id: string, quads: RDF.Quad[], membersCollection: Collection<Document>, indexCollection: Collection<MongoFragment>): Promise<FragmentFetcher> {
        const bucketProperty = findQuads(quads, namedNode(id), TREE.terms.path).map(x => x.object);
        return new FragmentFetcherImpl(id, bucketProperty, membersCollection, indexCollection);
    }
}

type MongoFragment = { leaf: boolean, ids: string[], fragmentId: string, relations: { type: string, values: string[], bucket: string }[], members?: string[], count: number, timeStamp?: string };
type Parsed = { segs: string[], query: { [label: string]: string } };
function parseIndex(index: string): Parsed {
    const [first, second] = index.split('?', 2);
    const query: { [label: string]: string } = {};

    if (second) {
        second.split("&").forEach(q => {
            const [key, value] = q.split("=", 2);
            query[key] = decodeURIComponent(value);
        })
    }

    if (first.length == 0) {
        return { segs: [], query };
    }
    return { segs: first.split("/"), query };
}

function reconstructIndex({ segs, query }: Parsed): string {
    const path = segs.join("/");
    const queries = [];

    for (let [key, value] of Object.entries(query)) {
        queries.push(`${key}=${encodeURIComponent(value)}`);
    }

    if (queries.length > 0) {
        return `${path}?${queries.join("&")}`;
    } else {
        return path;
    }
}

// TODO how to handle default values?
export class FragmentFetcherImpl implements FragmentFetcher {
    protected readonly id: string;
    protected readonly property: RDF.Term[];
    protected readonly members: Collection<Document>;
    protected readonly indices: Collection<MongoFragment>;

    constructor(id: string, property: RDF.Term[] | RDF.Term, members: Collection<Document>, indices: Collection<MongoFragment>) {
        this.id = id;
        this.property = (property instanceof Array) ? property : [property];
        this.members = members;
        this.indices = indices;
    }

    async fetch(id: string, timestampCapable: boolean, timestampPath?: RDF.Term): Promise<Fragment> {
        const fragmentId = this.id;
        const { segs, query } = parseIndex(id);

        // [a,b,c] => [[a], [a,b], [a,b,c]]
        const indices = segs.reduce((cum, _, i, arr) => [...cum, arr.slice(0, i + 1)], <string[][]>[]);

        console.log(fragmentId, segs, query, indices)

        let timestampValue = query["timestamp"];

        const relations = <RelationParameters[]>[];

        for (let i = 0; i < indices.length; i++) {
            const ids = indices[i];

            const fragment = await this.indices.findOne({ fragmentId, ids, leaf: false });
            const rels: RelationParameters[] | undefined = fragment?.relations.map(({ type, values, bucket }) => {
                const value: RDF.Term[] = values.map(x => literal(x));
                const index: Parsed = { segs: segs.slice(), query: {} };
                index.segs[i] = bucket;
                return { type: <RelationType>type, value, nodeId: reconstructIndex(index), path: this.property[i] };
            });

            if (rels !== undefined)
                relations.push(...rels);
        }

        const li = indices[indices.length - 1];

        let ids: string[] = []
        if (timestampCapable) {
            const search: Filter<MongoFragment> = { fragmentId, ids: segs, leaf: true };
            if (timestampValue)
                search.timeStamp = { "$lte": timestampValue };

            const actualTimestampBucket = await this.indices.find(search).sort({ "timeStamp": -1 }).limit(1).next();
            if (!actualTimestampBucket) {
                logger.error("No such bucket found! " + JSON.stringify(search));
            }

            ids = actualTimestampBucket?.members || [];

            const rels: RelationParameters[] | undefined = actualTimestampBucket?.relations.map(({ type, values, bucket }) => {
                const index: Parsed = { segs, query };
                index.query["timestamp"] = bucket;

                const value: RDF.Term[] = values.map(x => literal(x));
                return { type: <RelationType>type, value, nodeId: reconstructIndex(index), path: timestampPath };
            });

            if (rels !== undefined)
                relations.push(...rels);
        } else {
            const search = { fragmentId: this.id, ids: li, leaf: false };
            const fragments = await this.indices.findOne(search);
            if (!fragments) {
                logger.error("No such bucket found! " + JSON.stringify(search));
            }
            ids = fragments?.members || [];
        }

        const parser = new Parser();
        const members = await this.members.find({ id: { $in: ids } })
            .map(row => { return <Member>{ id: namedNode(row.id), quads: parser.parse(row.data) } })
            .toArray();

        return { members, cache: { pub: true }, relations };
    }
}
