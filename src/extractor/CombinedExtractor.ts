
import { CacheDirectives, Member } from "@treecg/types";
import { CacheExtractor, PathExtractor, QuadExtractor, RelationManager, SimpleIndex } from "../extractor";
import { Params } from "../types";
import { SimplePathExtractor } from "./PathExtractor";
import { SimpleQuadExtractor } from "./QuadExtractor";

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
    extractQuads(quads: Member, current: Idx[][], manager: RelationManager<Idx>): Idx[] {
        return this.quadExtractor.extractQuads(quads, current, manager);
    }
    async getCacheDirectives(indices: Idx[], members: Member[]): Promise<CacheDirectives | undefined> {
        return await this.cacheExtractor?.getCacheDirectives(indices, members);
    }
}

export class SimpleCombinedExtractor extends CombinedExtractor<SimpleIndex> {
    constructor(path: string, cacheExtractor?: CacheExtractor<SimpleIndex>) {
        super(new SimplePathExtractor(path), new SimpleQuadExtractor(path), cacheExtractor);
    }
}