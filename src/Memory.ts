import { Member, RelationType } from "@treecg/types";
import { CacheExtractor, IndexExtractor, PathExtractor, QuadExtractor, SimpleIndex } from './extractor';
import { AlternativePath, FragmentFetcherBase } from "./Fetcher";
import { StreamWriterBase } from "./StreamWriter";
import { Tree } from './Tree';
import { Wrapper } from "./types";

export interface Data<Idx> {
    items: Member[];
    children: { [key: string]: [Idx, Data<Idx>] };
};

export class NewData<Idx> implements Data<Idx> {
    public items = [];
    public children = {};
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

export class SimpleMemoryFetcher<Idx extends SimpleIndex = SimpleIndex> extends FragmentFetcherBase<Data<Idx>, Idx> {
    constructor(state: Wrapper<Data<Idx>>, extractors: PathExtractor<Idx>[], cacheExtractor: CacheExtractor<Idx>) {
        super(state.inner, extractors, cacheExtractor);
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
