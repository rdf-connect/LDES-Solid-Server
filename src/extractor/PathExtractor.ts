import type * as RDF from '@rdfjs/types';
import { DataFactory } from "rdf-data-factory";
import { PathExtractor, SimpleIndex } from "../extractor";
import { Params } from "../types";

export class SimplePathExtractor implements PathExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory = new DataFactory();
    private readonly path?: RDF.Quad_Predicate;

    constructor(path?: string) {
        if (path) {
            this.path = this.factory.namedNode(path);
        }
    }

    setDefault(old: Params, base: number): Params {
        return old;
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return new SimpleIndex(this.factory.literal(decodeURI(params.path[base])), this.path);
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