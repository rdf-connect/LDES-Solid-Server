import { Member, StreamWriter } from "@treecg/types";
import { Wrapper } from "./types";

export interface QuadExtractor<Idx = string> {
    extractQuads(quads: Member): Idx[];
}

export abstract class StreamWriterBase<State extends any, Idx = string> implements StreamWriter {
    protected state: State;
    protected quadExtractor: QuadExtractor<Idx>[];
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[]) {
        this.state = state.inner;
        this.quadExtractor = extractors;
    }

    async write(member: Member): Promise<void> {
        const indices = [];
        for (let extractor of this.quadExtractor) {
            try {
                const index = extractor.extractQuads(member);
                indices.push(index);
            } catch (e) {
                console.error(e);
                return;
            }
        }

        return await this._add(member, indices);
    }

    abstract _add(quads: Member, indices: Idx[][]): Promise<void>;
}
