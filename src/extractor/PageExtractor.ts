
import { CacheDirectives, Member } from "@treecg/types";
import { DataFactory } from "rdf-data-factory";
import { RdfParser } from "rdf-parse";
import { CacheExtractor, IndexExtractor, PathExtractor, SimpleIndex } from '../extractor';
import { Tree } from '../Tree';
import { Params } from "../types";
import type * as RDF from '@rdfjs/types';


export class SimplePageExtractor implements IndexExtractor<SimpleIndex>, PathExtractor<SimpleIndex>, CacheExtractor<SimpleIndex> {
    private factory = new DataFactory();
    private readonly itemsPerPage: number;
    private readonly sizeTree: Tree<SimpleIndex, number>;
    private readonly path: RDF.Quad_Predicate; 

    constructor(itemsPerPage: number, pathName: string) {
        this.path = this.factory.namedNode(pathName);
        this.itemsPerPage = itemsPerPage;
        this.sizeTree = new Tree((index: SimpleIndex) => index.value.value);
    }

    setDefault(old: Params, base: number): Params {
        const out = old.copy();
        out.query["page"] = "0";
        return out;
    }

    getCacheDirectives(indices: SimpleIndex[], _members: Member[]): CacheDirectives | undefined {
        const path = indices[indices.length - 1];
        const tree = indices.slice(0, -1).reduce((acc, ind) => acc.get(ind), this.sizeTree);
        const inBucket = tree.get_v() || 0;

        if ((parseInt(path.value.value) + 1) * this.itemsPerPage < inBucket) {
            // cache please
            return {
                pub: true,
                immutable: true,
                maxAge: 1500
            };
        }
        return;
    }

    extractIndices(root: Tree<SimpleIndex, void>): void {
        root.walkTreeWith(this.sizeTree, async (index, data, node) => {
            if (node.isLeaf()) {
                const leaf = data.get(index);
                leaf.update(f => f ? f + 1 : 1);

                const amount = leaf.get_v()!;
                const l = Math.floor(amount / this.itemsPerPage);
                node.get(new SimpleIndex(this.factory.literal(l.toString()), this.path, false));

                return ["end", undefined];
            }

            const next = data.get(index);
            return ["cont", next];
        });
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return new SimpleIndex(this.factory.literal(params.query["page"] || "0"), this.path, false);
    }

    setPath(index: SimpleIndex, old: Params, _base: number): Params {
        const out = old.copy();
        out.query["page"] = index.value.value;
        return out;
    }

    numberSegsRequired(): number {
        return 0;
    }
}
