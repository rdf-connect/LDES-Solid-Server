import { Readable } from "stream";

export interface ReadStream {
    createReadStream(url: string, options?: any): Readable;
}

export interface Initializable {
    initialize(): Promise<any>;
}

export interface Wrapper<T extends any> {
    inner: T;
}

export class RetentionPolicyImpl {
    get() {

    }
}

export interface StreamConstructor {
    create(): Promise<Readable>;
}
