import { DBConfig } from "../DBConfig";
import { env } from "process";
import { MongoDBRepository } from "./MongoDBRepository";
import { Member } from "@treecg/types";

export type Bucket = {
    id: string;
    streamId: string;
    leaf: boolean;
    value?: string;
    timeStamp?: number;
    immutable?: boolean;
    members: string[];
    relations: Relation[];
};

export type Relation = {
    bucket: string;
    path: string;
    type: string;
    value: string;
    timestampRelation?: boolean;
};

export type BucketSearch = {
    leaf?: boolean;
    timeStamp?: number;
};

export interface Repository {
    open(): Promise<void>;

    close(): Promise<void>;

    findMetadata(type: string, id: string): Promise<string | null>;

    findRoots(streamId: string): Promise<string[]>;

    findBucket(type: string, id?: string, search?: BucketSearch): Promise<Bucket | null>;

    findMembers(members: string[]): Promise<Member[]>;
}

export function getRepository(dbConfig: DBConfig): Repository {
    const url =
        dbConfig.url || env.DB_CONN_STRING || "mongodb://localhost:27017/ldes";

    if (url.startsWith("mongodb://")) {
        return new MongoDBRepository(
            url,
            dbConfig.meta,
            dbConfig.data,
            dbConfig.index,
        );
    } else {
        throw new Error("Unknown database type");
    }
}
