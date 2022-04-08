import { Member, MemberStore } from "@treecg/types";
import { IndexExtractor, QuadExtractor } from "./extractor";
import { Tree } from "./Tree";
import { Builder, Wrapper } from "./types";

export abstract class MemberStoreBase<State extends any, Idx = string> implements MemberStore {
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
        const tree = new Tree<Idx, void>();
        let current = [tree];

        for (let extractor of this.quadExtractor) {
            try {
                const index = extractor.extractQuads(member);
                current = index.flatMap(index => current.map(c => c.get(index)))
            } catch (e) {
                console.error(e);
                return;
            }
        }

        try {
            this.indexExtractors.forEach(e => e.extractIndices(tree));
        } catch (e) {
            console.error(e);
            return;
        }

        return await this._add(member, tree);
    }

    abstract _add(quads: Member, tree: Tree<Idx, void>): Promise<void>;
}

export abstract class MemberStoreBaseWithBuilder<State extends any, Idx = string> extends MemberStoreBase<State, Idx> {
    abstract _writeBuilder(): Builder<Idx, Member, void, void>;

    async _add(quads: Member, tree: Tree<Idx, void>): Promise<void> {
        tree.walkTreeWith(this._writeBuilder(), async (index, b, node) => {
            const { builder } = await b.with(index);

            if (node.isLeaf()) {
                await builder.finish(quads);
                return ["end", undefined];
            }

            return ["cont", builder];
        })
    }
}