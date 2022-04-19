import { Member, MemberStore } from "@treecg/types";
import { IndexExtractor, QuadExtractor } from "./extractor";
import { TreeData, Tree } from "./Tree";
import { Builder, ToString, Wrapper } from "./types";

// Helper class to implement a correct MemberStore
// consecutively extracting new Indices based from the different Extractors
export abstract class MemberStoreBase<State extends any, Idx extends ToString = string> implements MemberStore {
    protected state: State;

    protected quadExtractor: QuadExtractor<Idx>[];
    protected indexExtractors: IndexExtractor<Idx>[];
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[], indexExtractors: IndexExtractor<Idx>[] = []) {
        this.state = state.inner;
        this.quadExtractor = extractors;
        this.indexExtractors = indexExtractors;
    }

    abstract writeMetadata(metadata: any): Promise<void>;

    async write(member: Member): Promise<void> {
        const tree = Tree.create<Idx>();
        let current = [tree];

        for (let extractor of this.quadExtractor) {
            try {
                const index = extractor.extractQuads(member);
                current = index.flatMap(index => current.map(c => {
                    const n = Tree.get(c, index.toString());
                    n.value = index;
                    return n;
                }));
            } catch (e) {
                console.error(e);
                return;
            }
        }

        try {
            await Promise.all(this.indexExtractors.map(e => e.extractIndices(tree)));
        } catch (e) {
            console.error(e);
            return;
        }

        return await this._add(member, tree);
    }

    abstract _add(quads: Member, tree: TreeData<Idx>): Promise<void>;
}

// Helper class to correctly implement MemberStoreBase with a builder pattern
// Each node in the tree uses a new Index resulting in a new Builder
// At the end the Builder get's the added Member.
//
// Note: a member may be present in multiple fragments
export abstract class MemberStoreBaseWithBuilder<State extends any, Idx = string> extends MemberStoreBase<State, Idx> {
    abstract _writeBuilder(): Builder<Idx, Member, void, void>;

    async _add(quads: Member, tree: TreeData<Idx>): Promise<void> {
        Tree.walkTreeWith(tree, this._writeBuilder(), async (index, b, node) => {
            const { builder } = await b.with(node.value!);

            if (Tree.isLeaf(node)) {
                await builder.finish(quads);
                return ["end", undefined];
            }

            return ["cont", builder];
        })
    }
}