import type * as RDF from '@rdfjs/types';
import { LDES,  Fragment, FragmentFetcher, Member, RelationParameters, RelationType, SDS } from "@treecg/types";
import { Collection, Document, Filter } from "mongodb";
import { DataFactory, Parser } from "n3";
import winston from "winston";
import { MongoFragment } from '.';

const consoleTransport = new winston.transports.Console();
const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.label({ label: "Fetcher", message: true }),
        winston.format.colorize({ level: true }),
        winston.format.simple()
    ), transports: [consoleTransport]
});
const { namedNode, literal } = DataFactory;

export interface FragmentFetcherFactory {
    build(id: string, store: RDF.Quad[], membersCollection: Collection, indexCollection: Collection<MongoFragment>): Promise<FragmentFetcher>;
}

function isTimestampCapable(id: string, quads: RDF.Quad[]): boolean {
    const idTerm = namedNode(id);
    const dataset = quads.find(q => q.subject.equals(idTerm) && q.predicate.equals(SDS.terms.dataset))?.object;
    if(!dataset) return false;

    const timestampPath = quads.find(q => q.subject.equals(dataset) && q.predicate.equals(LDES.terms.timestampPath))?.object;
    return !!timestampPath;
}

export class FragmentFetcherFactoryImpl implements FragmentFetcherFactory {
    async build(id: string, streamMetadata: RDF.Quad[], membersCollection: Collection<Document>, indexCollection: Collection<MongoFragment>): Promise<FragmentFetcher> {
        const timestampCapable = isTimestampCapable(id, streamMetadata);
        return new FragmentFetcherImpl(id, timestampCapable, membersCollection, indexCollection);
    }
}

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
    protected readonly streamId: string;
    protected readonly timestampCapable: boolean;

    protected readonly members: Collection<Document>;
    protected readonly indices: Collection<MongoFragment>;

    constructor(streamId: string, timestampCapable: boolean, members: Collection<Document>, indices: Collection<MongoFragment>) {
        this.streamId = streamId;
        this.timestampCapable = timestampCapable;
        this.members = members;
        this.indices = indices;
    }

    async fetch(id: string): Promise<Fragment> {
        const streamId = this.streamId;
        logger.debug("streamid", streamId);
        const { segs, query } = parseIndex(id);

        // [a,b,c] => [[a], [a,b], [a,b,c]]
        const indices = segs.reduce((cum, _, i, arr) => [...cum, arr.slice(0, i + 1)], <string[][]>[]);

        const timestampValue = query["timestamp"];
        const relations = <RelationParameters[]>[];

        for (let i = 0; i < indices.length; i++) {
            const id = indices[i].join("/");

            const fragment = await this.indices.findOne({ streamId, id, leaf: false });
            if (!fragment) continue;

            const rels: RelationParameters[] = fragment!.relations.map(({ type, value, bucket, path }) => {
                const values: RDF.Term[] = [literal(value)];

                const index: Parsed = { segs: segs.slice(), query: {} };
                index.segs[i] = bucket;

                return { type: <RelationType>type, value: values, nodeId: reconstructIndex(index), path: namedNode(path) };
            });

            relations.push(...rels);
        }


        let ids: string[] = []
        if (this.timestampCapable) {
            const id = segs.join("/");
            const search: Filter<MongoFragment> = { streamId, id, leaf: true };

            if (timestampValue)
                search.timeStamp = { "$lte": timestampValue };

            const actualTimestampBucket = await this.indices.find(search).sort({ "timeStamp": -1 }).limit(1).next();
            if (!actualTimestampBucket) {
                logger.error("No such bucket found! " + JSON.stringify(search));
                ids = [];
            } else {
                ids = actualTimestampBucket!.members || [];

                const rels: RelationParameters[] = actualTimestampBucket!.relations.map(({ type, value, bucket, path }) => {
                    const index: Parsed = { segs, query };
                    index.query["timestamp"] = bucket;
                    const values: RDF.Term[] = [literal(value)];

                    return { type: <RelationType>type, value: values, nodeId: reconstructIndex(index), path: namedNode(path) };
                });

                relations.push(...rels);
            }

        } else {
            const id = segs.join("/");

            // Hmmmmm
            const search = { streamId , id, leaf: true };
            const fragments = await this.indices.findOne(search);
            if (!fragments) {
                logger.error("No such bucket found! " + JSON.stringify(search));
            } else {
                const rels: RelationParameters[] = fragments!.relations.map(({ type, value, bucket, path }) => {
                    const index: Parsed = { segs, query };
                    index.query["timestamp"] = bucket;
                    const values: RDF.Term[] = [literal(value)];

                    return { type: <RelationType>type, value: values, nodeId: reconstructIndex(index), path: namedNode(path) };
                });

                relations.push(...rels);
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

