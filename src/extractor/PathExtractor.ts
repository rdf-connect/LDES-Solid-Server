import type * as RDF from '@rdfjs/types';
import { DataFactory } from "rdf-data-factory";
import { PathExtractor, SimpleIndex } from "../extractor";
import { Params } from "../types";

export class SimplePathExtractor implements PathExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory = new DataFactory();
    private readonly path: RDF.Quad_Predicate;
    private readonly defaultValue?: SimpleIndex;
    private readonly useInRelations: boolean;

    constructor(path: string, defaultValue?: string, useInRelations: boolean = true) {
        this.useInRelations = useInRelations;
        this.path = this.factory.namedNode(path);
        if (defaultValue)
            this.defaultValue = new SimpleIndex(this.factory.literal(defaultValue), this.path, this.useInRelations);
    }

    setDefault(old: Params, base: number): Params {
        if (this.defaultValue)
            return this.setPath(this.defaultValue, old, base);
        else
            return old;
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return new SimpleIndex(this.factory.literal(decodeURI(params.path[base])), this.path, this.useInRelations);
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