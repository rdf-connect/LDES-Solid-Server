import type * as RDF from '@rdfjs/types';
import { Member } from '@treecg/types';
import { DataFactory } from "rdf-data-factory";
import { QuadExtractor, SimpleIndex } from ".";

export class SimpleQuadExtractor implements QuadExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory;
    private readonly path: RDF.Quad_Predicate;

    constructor(path: string) {
        this.factory = new DataFactory();
        this.path = this.factory.namedNode(path);
    }
    extractQuads(member: Member): SimpleIndex[] {
        const out = [];
        for (let quad of member.quads) {
            if (quad.predicate.value == this.path.value) {
                out.push({ value: quad.object, path: this.path });
            }
        }

        if (out.length == 0) {
            const msg = `Path nog found! ${this.path.value} in ${member.quads.map(x => x.predicate.value)}`
            console.error(msg)
        }

        return out;
    }
}