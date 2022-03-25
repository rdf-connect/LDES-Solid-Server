import { Member, StreamWriter } from "@treecg/types";
import { IndexExtractor, QuadExtractor } from "./extractor";
import { Tree } from "./Tree";
import { Wrapper } from "./types";


export abstract class StreamWriterBase<State extends any, Idx = string> implements StreamWriter {
    protected state: State;

    protected quadExtractor: QuadExtractor<Idx>[];
    protected indexExtractors: IndexExtractor<Idx>[];
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[], indexExtractors: IndexExtractor<Idx>[] = []) {
        this.state = state.inner;
        this.quadExtractor = extractors;
        this.indexExtractors = indexExtractors;
    }

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

    // Idx[][] because on one layer of indices there might be multiple options
    // For example:
    //   Extract language form an item
    //   but this item has multiple languages
    //   So add this item for all languages
    abstract _add(quads: Member, tree: Tree<Idx, void>): Promise<void>;
}
