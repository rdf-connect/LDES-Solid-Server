import type * as RDF from '@rdfjs/types';
import { Fragment, FragmentFetcher, Member, RelationParameters, RelationType } from "@treecg/types";
import { Wrapper } from "./types";

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

export type Alternative<Idx> = {
    index: Idx,
    type: RelationType,
    path: RDF.Term,
    value: RDF.Term,
    from: number,
};

export interface PathExtractor<Idx = string> {
    extractPath(params: Params, base: number): Idx;
    setPath(index: Idx, old: Params, base: number): Params;
    numberSegsRequired(): number;
}

export abstract class FragmentFetcherBase<State extends any, Idx = string> implements FragmentFetcher {
    protected state: State;
    protected pathExtractor: PathExtractor<Idx>[];
    private readonly pathSegments: number;

    constructor(state: Wrapper<State>, extractors: PathExtractor<Idx>[]) {
        this.state = state.inner;
        this.pathExtractor = extractors;
        this.pathSegments = this.pathExtractor.reduce((x, y) => x + y.numberSegsRequired(), 0)
    }

    async fetch(id: string): Promise<Fragment> {
        const params = new Params(id);
        const segments = params.path.length;

        if (segments < this.pathSegments)
            throw "Not enough segments in path, expected " + this.pathSegments;


        const indices = [];
        {
            let base = segments - this.pathSegments;
            for (let extractor of this.pathExtractor) {
                const index = extractor.extractPath(params, base);
                base += extractor.numberSegsRequired();
                indices.push(index);
            }
        }

        const [members, rels] = await this._fetch(indices);
        // Inverse sort base on from (highest first)
        rels.sort((a, b) => b.from - a.from);

        const relations: RelationParameters[] = [];

        let lastFrom = this.pathExtractor.length;
        let base = segments;

        for (let rel of rels) {
            for (let i = lastFrom; i > rel.from; i--) {
                base -= this.pathExtractor[i - 1].numberSegsRequired();
            }
            lastFrom = rel.from;

            console.log(base);
            const extractor = this.pathExtractor[rel.from];
            const newParams = extractor.setPath(rel.index, params, base);

            const relation = {
                type: rel.type,
                nodeId: newParams.toUrl(),
                value: [rel.value],
                path: rel.path
            };
            relations.push(relation);
        }

        return {
            members,
            relations,
            cache: null,
            metadata: null
        };
    }

    abstract _fetch(indices: Idx[]): Promise<[Member[], Alternative<Idx>[]]>;
}
