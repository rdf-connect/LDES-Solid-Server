import { Member, RelationType } from "@treecg/types";
import { LinkedList, LinkedNode } from ".";
import { CacheExtractor, IndexExtractor, PathExtractor, QuadExtractor, SimpleIndex } from './extractor';
import { AlternativePath, FragmentFetcherBase2 } from "./Fetcher";
import { StreamWriterBase2 } from "./StreamWriter";
import { Builder, BuilderTransformer, Comparable, Wrapper } from "./types";

export interface Data<Idx> {
    items: Member[];
    children: { [key: string]: [Idx, Data<Idx>] };
};

function checkX(x: undefined | Member): x is Member {
    return !!x;
}

// Make Builder more typable
type Input<Idx> = { key: string; index: Idx };
type Get = { 'type': 'GET' };
type Add = { 'type': 'ADD' };
function isAdd(x: Add | Get): x is Add {
    return x.type == "ADD";
}

export class SortedData<Idx extends Comparable> implements
    Builder<Input<Idx> & Get, void, { 'type': RelationType, 'index': Idx }[], Member[]>,
    Builder<Input<Idx> & Add, Member, void, void>
{
    public readonly items: Member[];
    public readonly children: { [key: string]: { idx: Idx, node: LinkedNode<Idx>, inner: SortedData<Idx> } }
    private readonly indices: LinkedList<Idx>;
    constructor() {
        this.items = [];
        this.children = {};
        this.indices = new LinkedList<Idx>();
    }

    async with(i: Input<Idx> & Add): Promise<{ builder: SortedData<Idx>, value: undefined }>;
    async with(i: Input<Idx> & Get): Promise<{ builder: SortedData<Idx>, value: { type: RelationType; index: Idx; }[] }>;
    async with(i: Input<Idx> & (Get | Add)): Promise<{ builder: SortedData<Idx>, value: { type: RelationType; index: Idx; }[] } | { builder: SortedData<Idx>, value: undefined }> {
        if (isAdd(i)) {
            this.makeSureExists(i.key, i.index);
            const child = this.children[i.key];
            return { builder: child.inner, value: undefined };
        } else {
            return this.get(i.key, i.index);
        }
    }

    async finish(): Promise<Member[]>;
    async finish(i: Member): Promise<undefined>;
    async finish(i?: Member): Promise<undefined | Member[]> {
        if (checkX(i)) {
            this.items.push(i);
            return;
        } else {
            return this.items;
        }
    }

    private makeSureExists(key: string, index: Idx) {
        if (!this.children[key]) {
            const bigger = this.indices.findFirst(n => index.cmp(n.item) > 0);
            const node = bigger ? bigger.prepend(index) : this.indices.append(index);

            this.children[key] = {
                idx: index,
                node: node,
                inner: new SortedData<Idx>(),
            };
        }
    }

    get(key: string, index: Idx): {
        builder: SortedData<Idx>,
        value: {
            'type': RelationType, 'index': Idx
        }[]
    } {
        this.makeSureExists(key, index);
        const child = this.children[key];

        const alters = [];
        if (child.node.prev) {
            alters.push({
                'type': RelationType.LessThan,
                'index': child.node.prev.item
            })
        }
        if (child.node.next) {
            alters.push({
                'type': RelationType.GreaterThan,
                'index': child.node.next.item
            })
        }

        return { builder: child.inner, value: alters };
    }
}

export class NewData<Idx> implements Data<Idx> {
    public items = [];
    public children = {};
}

export class SimpleMemoryWriter<Idx extends SimpleIndex> extends StreamWriterBase2<SortedData<Idx>, Idx>  {
    constructor(state: Wrapper<SortedData<Idx>>, extractors: QuadExtractor<Idx>[] = [], indexExtractors: IndexExtractor<Idx>[] = []) {
        super(state, extractors, indexExtractors);
    }

    _writeBuilder(): Builder<Idx, Member, void, void> {
        return new BuilderTransformer(
            this.state,
            {
                transformWithInput: (idx) => { return { type: "SET", key: idx.value.value, index: idx } },
            }
        );
    }
}

export class SimpleMemoryFetcher<Idx extends SimpleIndex = SimpleIndex> extends FragmentFetcherBase2<SortedData<Idx>, Idx> {
    constructor(state: Wrapper<SortedData<Idx>>, extractors: PathExtractor<Idx>[], cacheExtractor: CacheExtractor<Idx>) {
        super(state.inner, extractors, cacheExtractor);
    }

    _fetchBuilder(): Builder<[Idx, number], void, AlternativePath<Idx>[], Member[]> {
        // BuilderTransformer state
        let _i = 0;
        return new BuilderTransformer(
            this.state,
            {
                transformWithInput: ([idx, i]) => { _i = i; return { type: "GET", key: idx.value.value, index: idx } },
                transformWithOutput: (x) => {
                    return x.map(x => {
                        return {
                            index: x.index,
                            type: x.type,
                            path: x.index.path,
                            value: x.index.path ? [x.index.value] : [],
                            from: _i
                        }
                    })
                },
            }
        );
    }
}
