import type * as RDF from '@rdfjs/types';
import { CacheDirectives, Member, RelationType } from "@treecg/types";
import { TreeData } from './Tree';
import { Comparable, Params, ToString } from "./types";

// Reexport so componentsjs-generator is happy
export type Quad_Object = RDF.Quad_Object;
export type Quad_Predicate = RDF.Quad_Predicate;

// Extract Indices from a path
// Can also change a path that when visited would extract to that index
export interface PathExtractor<Idx = string> {
    extractPath(params: Params, base: number): Idx;
    setPath(index: Idx, old: Params, base: number): Params;
    setDefault(old: Params, base: number): Params;
    numberSegsRequired(): number;
}

// Extract cache directives from specific indices and the resulting members
export interface CacheExtractor<Idx = string> {
    getCacheDirectives(indices: Idx[], members: Member[]): Promise<CacheDirectives | undefined>;
}

export interface RelationManager<Idx> {
    addRelation(base: Idx[], target: Idx, rel: RelationType): Promise<void>;
    removeRelation(base: Idx[], target: Idx): Promise<void>;
}

// Extract indices from an incoming member
export interface QuadExtractor<Idx = string> {
    extractQuads(quads: Member, currentIndices: Idx[][], relationManager: RelationManager<Idx>): Idx[];
}

// Extract indices from extracted indices
// also contains new indices from previous IndexExtractor's
export interface IndexExtractor<Idx = string> {
    extractIndices(root: TreeData<Idx>, relationManager: RelationManager<Idx>): Promise<void>;
}

// Simple Index contains enough information to fragment based on properties and pages.
// Maybe a new class is required for other usecases like geospatial fragmentation
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

// Wrapper class for multiple extractors
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
    extractQuads(quads: Member, foo: Idx[][], manager: RelationManager<Idx>): Idx[] {
        return this.quadExtractor.extractQuads(quads, foo, manager);
    }
    async getCacheDirectives(indices: Idx[], members: Member[]): Promise<CacheDirectives | undefined> {
        return await this.cacheExtractor?.getCacheDirectives(indices, members);
    }
}

export * from './extractor/CombinedExtractor';
export * from './extractor/PageExtractor';
export * from './extractor/PathExtractor';
export * from './extractor/QuadExtractor';
