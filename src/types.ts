import { StreamReader } from "@treecg/types";
import type * as RDF from '@rdfjs/types';

export interface Initializable {
    initialize(): Promise<any>;
}

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

export interface CacheInstructions {
    public: boolean;
    maxAge?: number;
    immutable: boolean;
}
export function cacheToLiteral(instruction: CacheInstructions): string {
    const pub = instruction.public ? ["public"] : ["private"];
    const maxAge = instruction.maxAge ? ["max-age=" + instruction.maxAge] : [];
    const immutable = instruction.immutable ? ["immutable"] : [];

    return [...pub, ...maxAge, ...immutable].join(", ");
}
