import * as N3 from "n3";
import { RetentionPolicy, StreamWriter } from "./types";

export interface QuadExtractor<Idx = string, State = void> {
    extractQuads(quads: N3.Quad[], state: State): Idx;
}

export abstract class StreamWriterBase<State, Idx = string> implements StreamWriter {
    protected state: State;
    protected quadExtractor: QuadExtractor<Idx, State>[];
    constructor(state: State, extractors: QuadExtractor<Idx, State>[]) {
        this.state = state;
        this.quadExtractor = extractors;
    }

    push(quads: N3.Quad[], retentionPolicy: RetentionPolicy): Promise<void> {
        const indices = [];
        for (let extractor of this.quadExtractor) {
            const index = extractor.extractQuads(quads, this.state);
            indices.push(index);
        }

        return this._add(quads, indices, retentionPolicy);
    }

    abstract _add(quads: N3.Quad[], indices: Idx[], retentionPolicy: RetentionPolicy): Promise<void>;
}

