import { ResourceIdentifier } from "@solid/community-server";
import * as N3 from "n3";
import { ConstraintType, Fragment, FragmentFetcher, TreeRelation } from "./types";

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
        const path = parsed.pathname.split("/").slice(1);
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
        return new Params(this.url.toString());
    }
}

export type Alternative<Idx> = {
    index: Idx,
    type: ConstraintType,
    path: N3.Term,
    value: N3.Term,
    from: number,
};

export interface PathExtractor<Idx = string, State = void> {
    extractPath(params: Params, base: number, state: State): Idx;
    setPath(index: Idx, old: Params, base: number): Params;
    numberSegsRequired(): number;
}

export abstract class FragmentFetcherBase<State = any, Idx = string> implements FragmentFetcher {
    protected state: State;
    protected pathExtractor: PathExtractor<Idx, State>[];
    private readonly pathSegments: number;

    constructor(state: State, extractors: PathExtractor<Idx, State>[]) {
        this.state = state;
        this.pathExtractor = extractors;
        this.pathSegments = this.pathExtractor.reduce((x, y) => x + y.numberSegsRequired(), 0)
    }

    async fetch(id: ResourceIdentifier): Promise<Fragment> {
        const params = new Params(id.path);
        const segments = params.path.length;

        if (segments < this.pathSegments)
            throw "Not enough segments in path, expected " + this.pathSegments;


        const indices = [];
        {
            let base = segments - this.pathSegments;
            for (let extractor of this.pathExtractor) {
                const index = extractor.extractPath(params, base, this.state);
                base += extractor.numberSegsRequired();
                indices.push(index);
            }
        }

        const [members, rels] = await this._fetch(indices);
        // Inverse sort base on from (highest first)
        rels.sort((a, b) => b.from - a.from);

        const relations: TreeRelation[] = [];

        let lastFrom = this.pathExtractor.length;
        let base = this.pathSegments;

        for (let rel of rels) {
            for (let i = lastFrom; i > rel.from; i--) {
                base -= this.pathExtractor[i].numberSegsRequired();
            }

            const extractor = this.pathExtractor[rel.from];
            const newParams = extractor.setPath(rel.index, params, base);

            const relation = {
                type: rel.type,
                nodeId: newParams.toUrl(),
                value: rel.value,
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

    abstract _fetch(indices: Idx[]): Promise<[N3.Quad[], Alternative<Idx>[]]>;
}
