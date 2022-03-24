import type * as RDF from '@rdfjs/types';
import { Member, RelationType } from "@treecg/types";
import { DataFactory } from "rdf-data-factory";
import { AlternativePath, CacheExtractor, FragmentFetcherBase, Params, PathExtractor } from "./Fetcher";
import { IndexExtractor, QuadExtractor, StreamWriterBase } from "./StreamWriter";
import { Tree } from './Tree';
import { CacheInstructions, Wrapper } from "./types";

export interface SimpleIndex {
    value: RDF.Quad_Object,
    path?: RDF.Quad_Predicate,
}

export interface Data<Idx> {
    items: Member[];
    children: { [key: string]: [Idx, Data<Idx>] };
};

export class NewData<Idx> implements Data<Idx> {
    public items = [];
    public children = {};
}

export class SimplePageExtractor implements IndexExtractor<SimpleIndex>, PathExtractor<SimpleIndex>, CacheExtractor<SimpleIndex> {
    private factory = new DataFactory();
    private readonly itemsPerPage: number;
    private readonly sizeTree: Tree<SimpleIndex, number>;

    constructor(itemsPerPage: number) {
        this.itemsPerPage = itemsPerPage;
        this.sizeTree = new Tree((index: SimpleIndex) => index.value.value);
    }

    setDefault(old: Params, base: number): Params {
        const out = old.copy();
        out.query["page"] = "0";
        return out;
    }

    getCacheDirectives(indices: SimpleIndex[], _members: Member[], _alternatives: AlternativePath<SimpleIndex>[]): CacheInstructions | undefined {
        const path = indices[indices.length - 1];
        const tree = indices.slice(0, -1).reduce((acc, ind) => acc.get(ind), this.sizeTree);
        const inBucket = tree.get_v() || 0;

        if ((parseInt(path.value.value) + 1) * this.itemsPerPage < inBucket) {
            // cache please
            return {
                public: true,
                immutable: true,
                maxAge: 1500
            };
        }
        return;
    }

    extractIndices(root: Tree<SimpleIndex, void>): void {
        root.walkTreeWith(this.sizeTree, (index, data, node) => {
            if (node.isLeaf()) {
                const leaf = data.get(index);
                leaf.update(f => f ? f + 1 : 1);

                const amount = leaf.get_v()!;
                const l = Math.floor(amount / this.itemsPerPage);
                node.get({ value: this.factory.literal(l.toString()) });

                return ["end", undefined];
            }

            const next = data.get(index);
            return ["cont", next];
        });
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return { value: this.factory.literal(params.query["page"] || "0") };
    }

    setPath(index: SimpleIndex, old: Params, _base: number): Params {
        const out = old.copy();
        out.query["page"] = index.value.value;
        return out;
    }

    numberSegsRequired(): number {
        return 0;
    }
}

export class SimplerExtractor implements PathExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory = new DataFactory();

    setDefault(old: Params, base: number): Params {
        return old;
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return { value: this.factory.literal(decodeURI(params.path[base])) };
    }

    setPath(index: SimpleIndex, old: Params, base: number): Params {
        const out = old.copy();
        out.path[base] = index.value.value;
        return out;
    }

    numberSegsRequired(): number {
        return 1;
    }
}

export class SimpleExtractor implements PathExtractor<SimpleIndex>, QuadExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory;
    private readonly path: RDF.Quad_Predicate;

    constructor(path: string) {
        this.factory = new DataFactory();
        this.path = this.factory.namedNode(path);
    }
    setDefault(old: Params, base: number): Params {
        return old;
    }

    extractQuads(member: Member): SimpleIndex[] {
        const out = [];
        for (let quad of member.quads) {
            if (quad.predicate.value == this.path.value) {
                out.push({ value: quad.object, path: this.path });
            }
        }

        if (out.length == 0) {
            const msg = `Path nog found! ${this.path.value} in ${member.quads.map(x => x.predicate.value)}`
            console.error(msg)
        }

        return out;
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return { value: this.factory.literal(decodeURI(params.path[base])), path: this.path };
    }

    setPath(index: SimpleIndex, old: Params, base: number): Params {
        const out = old.copy();
        out.path[base] = index.value.value;
        return out;
    }

    numberSegsRequired(): number {
        return 1;
    }
}

export class SimpleMemoryWriter<Idx extends SimpleIndex> extends StreamWriterBase<Data<Idx>, Idx>  {
    constructor(state: Wrapper<Data<Idx>>, extractors: QuadExtractor<Idx>[] = [], indexExtractors: IndexExtractor<Idx>[] = []) {
        super(state, extractors, indexExtractors);
    }

    async _add(quads: Member, tree: Tree<Idx, void>): Promise<void> {

        const x = tree.walkTreeWith<Data<Idx>, undefined>(this.state, (index, state, node) => {
            const value = index.value.value;

            if (!state.children[value]) {
                state.children[value] = [index, { items: [], children: {} }];
            }

            if (node.isLeaf()) {
                state.children[value][1].items.push(quads);
                return ["end", undefined];
            }

            return ["cont", state.children[value][1]];
        })
    }
}

export class SimpleMemoryFetcher<Idx extends SimpleIndex> extends FragmentFetcherBase<Data<Idx>, Idx> {
    constructor(state: Wrapper<Data<Idx>>, extractors: PathExtractor<Idx>[], cacheExtractor: CacheExtractor<Idx>) {
        super(state, extractors, cacheExtractor);
    }

    async _fetch(indices: Idx[]): Promise<{ members: Member[], relations: AlternativePath<Idx>[] }> {
        let current = this.state;
        const alternatives: AlternativePath<Idx>[] = [];

        for (let i = 0; i < indices.length; i++) {
            const index = indices[i];
            const key = index.value.value;

            if (!current.children[key]) {
                current.children[key] = [index, { items: [], children: {} }];
            }

            for (let other in current.children) {
                if (other == key) continue;
                const nIndex = current.children[other][0];

                const alternative: AlternativePath<Idx> = {
                    index: nIndex,
                    type: RelationType.EqualThan,
                    path: nIndex.path,
                    value: nIndex.path ? [nIndex.value] : [],
                    from: i,
                };

                alternatives.push(alternative);
            }

            current = current.children[key][1];
        }

        return { members: current.items, relations: alternatives };
    }
}
