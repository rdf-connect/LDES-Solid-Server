import { CacheDirectives, StreamReader } from "@treecg/types";

export interface Wrapper<T extends any = any> {
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

export interface Builder<I, II, A, O> {
    with(i: I): Promise<[Builder<I, II, A, O>, A]>;
    finish(i: II): Promise<O>;
}

export interface Transformers<I, II, A, O, I2 = I, II2 = II, A2 = A, O2 = O> {
    iToI2?: (i: I) => I2,
    iIToII2?: (i: II) => II2,
    a2ToA?: (i: A2) => A,
    o2ToO?: (i: O2) => O,
}
export type T<I, O> = (i: I) => O;
export class BuilderTransformer<I, II, A, O, I2 = I, II2 = II, A2 = A, O2 = O> implements Builder<I, II, A, O> {
    private inner: Builder<I2, II2, A2, O2>;
    private transformers: Transformers<I, II, A, O, I2, II2, A2, O2>;

    constructor(
        inner: Builder<I2, II2, A2, O2>,
        transformers: Transformers<I, II, A, O, I2, II2, A2, O2>
    ) {
        this.inner = inner;
        this.transformers = transformers;
    }

    async with(i: I): Promise<[Builder<I, II, A, O>, A]> {
        const i2 = this.transformers.iToI2 ? this.transformers.iToI2(i) : <I2><unknown>i;
        const [nb, a] = await this.inner.with(i2);
        const a2 = this.transformers.a2ToA ? this.transformers.a2ToA(a) : <A><unknown>a;
        return [
            new BuilderTransformer<I, II, A, O, I2, II2, A2, O2>(nb, this.transformers),
            a2
        ]
    }

    async finish(i: II): Promise<O> {
        const i2 = this.transformers.iIToII2 ? this.transformers.iIToII2(i) : <II2><unknown>i;
        const o2 = await this.inner.finish(i2);
        const o = this.transformers.o2ToO ? this.transformers.o2ToO(o2) : <O><unknown>o2;
        return o;
    }
}

export interface Comparable {
    cmp(other: this): number;
}
