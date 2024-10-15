import { DBConfig } from "../DBConfig";
import { env } from "process";
import { MongoDBRepository } from "./MongoDBRepository";
import { Member } from "@treecg/types";
import { RedisRepository } from "./RedisRepository";

export type Bucket = {
    id: string;
    streamId: string;
    root: boolean;
    value?: string;
    immutable?: boolean;
    members: string[];
    relations: Relation[];
    created: number,
    updated: number,
};

export type Relation = {
    bucket: string;
    path: string;
    type: string;
    value: string;
    timestampRelation?: boolean;
};

export interface Repository {
    open(): Promise<void>;

    close(): Promise<void>;

    findMetadata(type: string, id: string): Promise<string | null>;

    findRoots(streamId: string): Promise<string[]>;

    findBucket(type: string, id: string): Promise<Bucket | null>;

    findMembers(members: string[]): Promise<Member[]>;
}

export function getRepository(dbConfig: DBConfig): Repository {
    const url =
        dbConfig.url || env.DB_CONN_STRING || "mongodb://localhost:27017/ldes";

    if (url.startsWith("mongodb")) {
        return new MongoDBRepository(
            url,
            dbConfig.meta,
            dbConfig.data,
            dbConfig.index,
        );
    } else if (url.startsWith("redis")) {
        return new RedisRepository(
            url,
            dbConfig.meta,
            dbConfig.data,
            dbConfig.index,
        );
    } else {
        throw new Error("Unknown database type");
    }
}
