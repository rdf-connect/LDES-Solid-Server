import { CacheDirectives, StreamReader } from "@treecg/types";

export interface Wrapper<T extends any> {
    inner: T;
}

export interface StreamConstructor {
    create(): Promise<StreamReader>;
}

export namespace NS {
    export namespace Tree {
        export const NS: string = "https://w3id.org/tree#";
        export const Path = `${Tree.NS}path`;
        export const Member = `${Tree.NS}member`;
        export const Value = `${Tree.NS}value`;
        export const Node = `${Tree.NS}node`;
        export const View = `${Tree.NS}view`;
        export const Relation = `${Tree.NS}relation`;
    }

    export const Type: string = "http://www.w3.org/1999/02/22-rdf-syntax-ns#type";

    export namespace LDES {
        export const NS: string = "https://w3id.org/ldes#";
        export const EventStream: string = `${NS}EventStream`
    }
}

export function cacheToLiteral(instruction: CacheDirectives): string {
    const pub = instruction.pub ? ["public"] : ["private"];
    const maxAge = instruction.maxAge ? ["max-age=" + instruction.maxAge] : [];
    const immutable = instruction.immutable ? ["immutable"] : [];

    return [...pub, ...maxAge, ...immutable].join(", ");
}

export class Params {
    private url: URL;
    public readonly path: string[];
    public readonly query: { [key: string]: string };
    constructor(url: string) {
        const parsed = new URL(url);
        this.url = parsed;

        const query: { [key: string]: string } = {};
        for (let [k, v] of parsed.searchParams.entries()) {
            query[k] = v;
        }

        // Drop empty hostname
        const path = parsed.pathname.split("/").slice(1).map(decodeURIComponent);
        this.path = path;
        this.query = query;
    }

    toUrl(): string {
        for (let [k, v] of Object.entries(this.query)) {
            this.url.searchParams.set(k, v);
        }

        this.url.pathname = "/" + this.path.join("/");

        return this.url.toString();
    }

    copy(): Params {
        return new Params(this.toUrl());
    }
}

