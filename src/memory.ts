import type * as RDF from '@rdfjs/types';
import { Member, RelationType } from "@treecg/types";
import { DataFactory } from "rdf-data-factory";
import { Alternative, FragmentFetcherBase, Params, PathExtractor } from "./fetcher";
import { QuadExtractor, StreamWriterBase } from "./streamWriter";
import { Wrapper } from "./types";


export interface Config<T> {
    toQuad(t: T): RDF.Quad[];
    fromQuad(quads: RDF.Quad[]): T
}

export class PojoConfig implements Config<any> {
    public readonly factory = new DataFactory();
    toQuad(t: any): RDF.Quad[] {
        console.log("Got t", t)
        const quads: RDF.Quad[] = [];
        const id = this.factory.blankNode();

        for (let k in t) {
            quads.push(this.factory.quad(
                id, this.factory.namedNode(k), this.factory.literal(t[k])
            ));
        }

        return quads;
    }

    fromQuad(quads: RDF.Quad[]): any {
        const out: any = {};

        for (let quad of quads) {
            out[quad.predicate.value] = quad.object.value;
        }

        return out;
    }
}

export class SimpleExtractor implements PathExtractor<SimpleIndex>, QuadExtractor<SimpleIndex> {
    public readonly factory: RDF.DataFactory;
    private readonly path: RDF.Quad_Predicate;

    constructor(path: string) {
        this.factory = new DataFactory();
        this.path = this.factory.namedNode(path);
    }

    extractQuads(member: Member): SimpleIndex {
        for (let quad of member.quads) {
            if (quad.predicate.value == this.path.value) {
                return { value: quad.object, path: this.path };
            }
        }

        const msg = `Path nog found! ${this.path.value} in ${member.quads.map(x => x.predicate.value)}`
        throw msg
    }

    extractPath(params: Params, base: number): SimpleIndex {
        return { value: this.factory.literal(decodeURI(params.path[base])), path: this.path };
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

export interface SimpleIndex {
    path: RDF.Quad_Predicate,
    value: RDF.Quad_Object,
}

export interface Data<Idx> {
    items: Member[];
    children: { [key: string]: [Idx, Data<Idx>] };
};

export class NewData<Idx> implements Data<Idx> {
    public items = [];
    public children = {};
}


export class SimpleMemoryWriter<Idx extends SimpleIndex> extends StreamWriterBase<Data<Idx>, Idx>  {
    constructor(state: Wrapper<Data<Idx>>, extractors?: QuadExtractor<Idx>[]) {
        super(state, extractors || []);
    }

    async _add(quads: Member, indices: Idx[]): Promise<void> {
        let current = this.state;

        for (let i = 0; i < indices.length; i++) {
            const index = indices[i];
            const value = index.value.value;

            if (!current.children[value]) {
                current.children[value] = [index, { items: [], children: {} }];
            }

            current = current.children[value][1];
        }

        current.items.push(quads);
    }
}

export class SimpleMemoryFetcher<Idx extends SimpleIndex> extends FragmentFetcherBase<Data<Idx>, Idx> {
    // TODO: actually use this
    private readonly itemsPerFragment;
    constructor(state: Wrapper<Data<Idx>>, extractors?: PathExtractor<Idx>[], itemsPerFragment: number = 5) {
        super(state, extractors || []);
        this.itemsPerFragment = itemsPerFragment;
    }

    async _fetch(indices: Idx[]): Promise<[Member[], Alternative<Idx>[]]> {
        let current = this.state;
        const alternatives: Alternative<Idx>[] = [];

        for (let i = 0; i < indices.length; i++) {
            const index = indices[i];
            const key = index.value.value;

            if (!current.children[key]) {
                current.children[key] = [index, { items: [], children: {} }];
            }


            for (let other in current.children) {
                if (other == key) continue;
                const nIndex = current.children[other][0];

                const alternative: Alternative<Idx> = {
                    index: index,
                    type: RelationType.EqualThan,
                    path: nIndex.path,
                    value: nIndex.value,
                    from: i,
                };
                alternatives.push(alternative);
            }

            current = current.children[key][1];
        }

        return [current.items, alternatives];
    }
}
