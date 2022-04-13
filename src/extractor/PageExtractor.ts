
import type * as RDF from '@rdfjs/types';
import { CacheDirectives, Member } from "@treecg/types";
import { DataFactory } from "rdf-data-factory";
import { DataSync } from "../DataSync";
import { CacheExtractor, IndexExtractor, PathExtractor, SimpleIndex } from '../extractor';
import { TreeData, TreeTwo } from '../Tree';
import { Params } from "../types";


export class SimplePageExtractor implements IndexExtractor<SimpleIndex>, PathExtractor<SimpleIndex>, CacheExtractor<SimpleIndex> {
    private factory = new DataFactory();
    private readonly itemsPerPage: number;
    private readonly sizeTree: DataSync<TreeData<number>>;
    private readonly path: RDF.Quad_Predicate;

    constructor(itemsPerPage: number, pathName: string, sizeTree: DataSync<TreeData<number>>) {
        this.path = this.factory.namedNode(pathName);
        this.itemsPerPage = itemsPerPage;
        this.sizeTree = sizeTree;
        if (!this.sizeTree.get()) this.sizeTree.save(TreeTwo.create());
    }

    setDefault(old: Params, base: number): Params {
        const out = old.copy();
        out.query["page"] = "0";
        return out;
    }

    getCacheDirectives(indices: SimpleIndex[], _members: Member[]): CacheDirectives | undefined {
        const path = indices[indices.length - 1];
        const tree = indices.slice(0, -1).reduce((acc, ind) => TreeTwo.get(acc, ind.value.value), this.sizeTree.get());
        const inBucket = tree.value || 0;

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

    extractIndices(root: TreeData<SimpleIndex>): void {
        let sizeTree = this.sizeTree.get();
        if (!sizeTree) sizeTree = TreeTwo.create();

        TreeTwo.walkTreeWith(root, sizeTree, async (index, data, node) => {
            if (TreeTwo.isLeaf(node)) {
                const leaf = TreeTwo.get(data, index);
                const amount = leaf.value = leaf.value ? leaf.value + 1 : 1;

                const l = Math.floor(amount / this.itemsPerPage);

                const indexLeaf = TreeTwo.get(node, l.toString());
                indexLeaf.value = new SimpleIndex(this.factory.literal(l.toString()), this.path, false);

                return ["end", undefined];
            }

            const next = TreeTwo.get(data, index);
            return ["cont", next];
        });

        this.sizeTree.save(sizeTree);
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
