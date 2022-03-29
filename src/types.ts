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

/// Builder type
/// Generics:
/// - WI input type of `with` function
/// - WO output type of `with` function
/// - FI input type of `finish` function
/// - FO output type of `finish` function
export interface Builder<WI, FI, WO, FO> {
    with(i: WI): Promise<{ builder: Builder<WI, FI, WO, FO>, value: WO }>;
    finish(i: FI): Promise<FO>;
}

/// Wrapper for all converting functions for BuilderTransformers
/// converting Builder<WI2, FI2, WO2, FO2> to Builder<WI, FI, WO, FO>
export interface Transformers<WI, FI, WO, FO, WI2 = WI, FI2 = FI, WO2 = WO, FO2 = FO> {
    transformWithInput?: (i: WI) => WI2,
    transformFinishInput?: (i: FI) => FI2,
    transformWithOutput?: (i: WO2) => WO,
    transformFinishOutput?: (i: FO2) => FO,
}

export class BuilderTransformer<WI, FI, WO, FO, WI2 = WI, FI2 = FI, WO2 = WO, FO2 = FO> implements Builder<WI, FI, WO, FO> {
    private inner: Builder<WI2, FI2, WO2, FO2>;
    private transformers: Transformers<WI, FI, WO, FO, WI2, FI2, WO2, FO2>;

    constructor(
        inner: Builder<WI2, FI2, WO2, FO2>,
        transformers: Transformers<WI, FI, WO, FO, WI2, FI2, WO2, FO2>,
    ) {
        this.inner = inner;
        this.transformers = transformers;
    }

    async with(i: WI): Promise<{ builder: Builder<WI, FI, WO, FO>, value: WO }> {
        const i2 = this.transformers.transformWithInput ? this.transformers.transformWithInput(i) : <WI2><unknown>i;
        const { builder, value } = await this.inner.with(i2);
        const a2 = this.transformers.transformWithOutput ? this.transformers.transformWithOutput(value) : <WO><unknown>value;
        return {
            builder: new BuilderTransformer(builder, this.transformers),
            value: a2
        }
    }

    async finish(i: FI): Promise<FO> {
        const i2 = this.transformers.transformFinishInput ? this.transformers.transformFinishInput(i) : <FI2><unknown>i;
        const o2 = await this.inner.finish(i2);
        const o = this.transformers.transformFinishOutput ? this.transformers.transformFinishOutput(o2) : <FO><unknown>o2;
        return o;
    }
}

export interface Comparable {
    cmp(other: this): number;
}
