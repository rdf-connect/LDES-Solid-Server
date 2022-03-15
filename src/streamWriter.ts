import * as N3 from "n3";
import { RetentionPolicy, StreamWriter, Wrapper } from "./types";

export interface QuadExtractor<Idx = string> {
    extractQuads(quads: N3.Quad[]): Idx;
}

export abstract class StreamWriterBase<State extends any, Idx = string> implements StreamWriter {
    protected state: State;
    protected quadExtractor: QuadExtractor<Idx>[];
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[]) {
        this.state = state.inner;
        this.quadExtractor = extractors;
    }

    push(quads: N3.Quad[], retentionPolicy: RetentionPolicy): Promise<void> {
        const indices = [];
        for (let extractor of this.quadExtractor) {
            const index = extractor.extractQuads(quads);
            indices.push(index);
        }

        return this._add(quads, indices, retentionPolicy);
    }

    abstract _add(quads: N3.Quad[], indices: Idx[], retentionPolicy: RetentionPolicy): Promise<void>;
}

