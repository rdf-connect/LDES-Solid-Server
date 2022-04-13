import type * as RDF from '@rdfjs/types';
import { CacheDirectives, Member } from "@treecg/types";
import { TreeData } from './Tree';
import { Comparable, Params, ToString } from "./types";

// Reexport so componentsjs-generator is happy
export type Quad_Object = RDF.Quad_Object;
export type Quad_Predicate = RDF.Quad_Predicate;

export interface PathExtractor<Idx = string> {
    extractPath(params: Params, base: number): Idx;
    setPath(index: Idx, old: Params, base: number): Params;
    setDefault(old: Params, base: number): Params;
    numberSegsRequired(): number;
}

export interface CacheExtractor<Idx = string> {
    getCacheDirectives(indices: Idx[], members: Member[]): CacheDirectives | undefined;
}

export interface QuadExtractor<Idx = string> {
    extractQuads(quads: Member): Idx[];
}

export interface IndexExtractor<Idx = string> {
    extractIndices(root: TreeData<Idx>): void;
}

export class SimpleIndex implements Comparable, ToString {
    public readonly value: RDF.Quad_Object;
    public readonly path: RDF.Quad_Predicate;
    public readonly useInRelation: boolean;
    constructor(value: Quad_Object, path: Quad_Predicate, useInRelation = true) {
        this.value = value;
        this.path = path;
        this.useInRelation = useInRelation;
    }
    toString(): string {
        return this.value.value;
    }
    cmp(other: this): number {
        return this.value > other.value ? 1 : -1;
    }
}

export class CombinedExtractor<Idx = string> implements PathExtractor<Idx>, QuadExtractor<Idx>, CacheExtractor<Idx> {
    private readonly pathExtractor: PathExtractor<Idx>;
    private readonly quadExtractor: QuadExtractor<Idx>;
    private readonly cacheExtractor?: CacheExtractor<Idx>;

    constructor(pathExtractor: PathExtractor<Idx>, quadExtractor: QuadExtractor<Idx>, cacheExtractor?: CacheExtractor<Idx>) {
        this.pathExtractor = pathExtractor;
        this.quadExtractor = quadExtractor;
        this.cacheExtractor = cacheExtractor;
    }
    extractPath(params: Params, base: number): Idx {
        return this.pathExtractor.extractPath(params, base);
    }
    setPath(index: Idx, old: Params, base: number): Params {
        return this.pathExtractor.setPath(index, old, base);
    }
    setDefault(old: Params, base: number): Params {
        return this.pathExtractor.setDefault(old, base);
    }
    numberSegsRequired(): number {
        return this.pathExtractor.numberSegsRequired();
    }
    extractQuads(quads: Member): Idx[] {
        return this.quadExtractor.extractQuads(quads);
    }
    getCacheDirectives(indices: Idx[], members: Member[]): CacheDirectives | undefined {
        return this.cacheExtractor?.getCacheDirectives(indices, members);
    }
}

export * from './extractor/CombinedExtractor';
export * from './extractor/PageExtractor';
export * from './extractor/PathExtractor';
export * from './extractor/QuadExtractor';

