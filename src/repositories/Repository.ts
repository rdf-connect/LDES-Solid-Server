import { env } from "process";
import { MongoDBRepository } from "./MongoDBRepository";
import { RedisRepository } from "./RedisRepository";
import { Quad, Term } from "@rdfjs/types";

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

export type Member = {
    id: Term;
    quads: Quad[];
    created: number;
};

export interface Repository {
    open(): Promise<void>;

    close(): Promise<void>;

    findMetadata(type: string, id: string): Promise<string | null>;

    findRoots(streamId: string): Promise<string[]>;

    findBucket(type: string, id: string): Promise<Bucket | null>;

    findMembers(members: string[]): Promise<Member[]>;
}
