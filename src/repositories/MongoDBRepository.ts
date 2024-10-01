import { Bucket, BucketSearch, Repository } from "./Repository";
import { getLoggerFor } from "@solid/community-server";
import { Db, MongoClient } from "mongodb";
import { Member } from "@treecg/types";
import { DataFactory, Parser } from "n3";
import namedNode = DataFactory.namedNode;

export class MongoDBRepository implements Repository {
    protected url: string;
    protected metadata: string;
    protected data: string;
    protected index: string;

    protected client: MongoClient | undefined;
    protected db: Db | undefined;

    protected logger = getLoggerFor(this);

    constructor(url: string, metadata: string, data: string, index: string) {
        this.url = url;
        this.metadata = metadata;
        this.data = data;
        this.index = index;
    }

    async open(): Promise<void> {
        this.client = await new MongoClient(this.url).connect();
        this.db = this.client.db();

        this.logger.debug(`Connected to ${this.url}`);
    }

    async close(): Promise<void> {
        await this.client?.close();

        this.logger.debug(`Closed connection to ${this.url}`);
    }

    async findMetadata(type: string, id: string): Promise<string | null> {
        return this.db?.collection(this.metadata)
            .findOne({ type, id })
            .then((entry) => entry?.value ?? null);
    }

    async findRoots(streamId: string): Promise<string[]> {
        return this.db?.collection(this.index)
            .find({ root: true, streamId })
            .toArray()
            .then((roots) => roots.map((root) => root.id)) ?? [];
    }

    async findBucket(type: string, id?: string, search?: BucketSearch): Promise<Bucket | null> {
        const filter: any = { streamId: type, id: id };
        if (search?.leaf) {
            filter.leaf = search.leaf;
        }
        if (search?.timeStamp) {
            filter.timeStamp = { $lte: new Date(search.timeStamp) };
        }
        return this.db?.collection(this.index)
            .find(filter)
            .sort({ timeStamp: -1 })
            .limit(1)
            .next()
            .then((entry) => {
                if (!entry) {
                    return null;
                }
                return {
                    id: entry.id,
                    streamId: entry.streamId,
                    leaf: entry.leaf,
                    value: entry.value,
                    timeStamp: entry.timeStamp,
                    immutable: entry.immutable,
                    members: entry.members,
                    relations: entry.relations,
                };
            }) ?? null;
    }

    async findMembers(members: string[]): Promise<Member[]> {
        return this.db?.collection(this.data)
            .find({ id: { $in: members } })
            .map((row) => {
                return <Member>{
                    id: namedNode(row.id),
                    quads: new Parser().parse(row.data),
                };
            })
            .toArray() ?? [];
    }
}
