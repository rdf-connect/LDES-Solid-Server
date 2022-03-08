import { Readable } from "stream";
import { Fragment, FragmentFetcher } from "./fragments";
import { Store } from "./memory";

export interface RetentionPolicy {
    get(): void;
}
export class RetentionPolicyImpl {
    get() {

    }
}
// export type RetentionPolicy = any;

export interface StreamConstructor {
    create(): Promise<Readable>;
}

export interface StreamReader<T> {
    poll(): Promise<T | undefined>;
}

export interface StreamWriter<T> {
    push(item: T, retentionPolicy: RetentionPolicy): Promise<void>;
}
