import { Bucket, Repository } from "./Repository";
import { createClient, RedisClientType, RediSearchSchema, SchemaFieldTypes } from "redis";
import { getLoggerFor } from "@solid/community-server";
import { Member } from "@treecg/types";
import { DataFactory, Parser } from "n3";
import namedNode = DataFactory.namedNode;

export class RedisRepository implements Repository {
    protected url: string;
    protected metadata: string;
    protected data: string;
    protected index: string;

    protected client: RedisClientType | undefined;

    protected logger = getLoggerFor(this);

    constructor(url: string, metadata: string, data: string, index: string) {
        this.url = url;
        this.metadata = metadata;
        this.data = data;
        this.index = index;
    }

    async open(): Promise<void> {
        this.client = createClient({ url: this.url });
        await this.client.connect();

        this.logger.debug(`Connected to ${this.url}`);

        await this.createSearchIndex();
    }

    async close(): Promise<void> {
        await this.client?.disconnect();

        this.logger.debug(`Closed connection to ${this.url}`);
    }

    async findMetadata(type: string, id: string): Promise<string | null> {
        return this.client?.get(`${this.metadata}:${encodeURIComponent(type)}:${encodeURIComponent(id)}`) ?? null;
    }

    async findRoots(streamId: string): Promise<string[]> {
        const result = await this.client?.ft.search(`idx:${this.index}`, `(@streamId:{${this.encodeKey(streamId)}}) (@root:{true})`, { RETURN: ["id"] });
        return result?.documents.map((doc) => doc.value.id as string) ?? [];
    }

    async findBucket(type: string, id: string): Promise<Bucket | null> {
        const query = `(@streamId:{${this.encodeKey(type)}) (@id:{${this.encodeKey(id)}})`;
        const result = (await this.client?.ft.search(`idx:${this.index}`, query))?.documents ?? [];
        const doc = result.pop();
        if (!doc) {
            return null;
        }

        const members = await this.client?.sMembers(`${this.index}:${encodeURIComponent(type)}:${encodeURIComponent(doc.value.id as string)}:members`) ?? [];
        const relations = ((await this.client?.sMembers(`${this.index}:${encodeURIComponent(type)}:${encodeURIComponent(doc.value.id as string)}:relations`)) ?? []).map((relation) => JSON.parse(relation));

        return {
            id: doc.id,
            streamId: type,
            root: doc.value.root as unknown as boolean,
            value: doc.value.value ? (doc.value.value as string) : undefined,
            immutable: doc.value.immutable as unknown as boolean,
            members: members,
            relations: relations,
        };
    }

    async findMembers(members: string[]): Promise<Member[]> {
        return (await this.client?.mGet(members.map((member) => `${this.data}:${encodeURIComponent(member)}`)) ?? [])
            .filter((entry) => entry !== null)
            .map((entry, i) => {
                return {
                    id: namedNode(members[i]),
                    quads: new Parser().parse(entry),
                };
            });
    }

    async createSearchIndex(): Promise<void> {
        try {
            const schema: RediSearchSchema = {
                "$.streamId": {
                    type: SchemaFieldTypes.TAG,
                    AS: "streamId",
                },
                "$.id": {
                    type: SchemaFieldTypes.TAG,
                    AS: "id",
                },
                "$.root": {
                    type: SchemaFieldTypes.TAG,
                    AS: "root",
                },
                "$.value": {
                    type: SchemaFieldTypes.TEXT,
                    AS: "value",
                },
                "$.immutable": {
                    type: SchemaFieldTypes.TAG,
                    AS: "immutable",
                },
            };
            await this.client?.ft.create(`idx:${this.index}`, schema, {
                ON: "JSON",
                PREFIX: this.index,
            });
            this.logger.info(`Created index idx:${this.index}`);
        } catch (e) {
            // Index already exists
            this.logger.debug(`Index idx:${this.index} already exists`);
        }
    }

    encodeKey(key: string): string {
        // Add \\ in front of ., :, /, -
        return key.replace(/([.:\/-])/g, "\\$1");
    }
}