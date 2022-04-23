import type * as RDF from '@rdfjs/types';
import { Member, RelationType } from '@treecg/types';
import { DataFactory } from "rdf-data-factory";
import { QuadExtractor, RelationManager, SimpleIndex } from "../extractor";

// Extracts SimpleIndices from a new Member
export class SimpleQuadExtractor implements QuadExtractor<SimpleIndex> {
    private readonly factory: RDF.DataFactory;
    private readonly path: RDF.Quad_Predicate;
    private readonly strategy: BucketStrategy<SimpleIndex>;


    constructor(path: string, strategy: BucketStrategy<SimpleIndex> = new SimpleBucketStrategy()) {
        this.factory = new DataFactory();
        this.path = this.factory.namedNode(path);
        this.strategy = strategy;
    }

    extractQuads(member: Member, foos: SimpleIndex[][], manager: RelationManager<SimpleIndex>): SimpleIndex[] {
        const out: SimpleIndex[] = [];
        const values = [];
        for (let quad of member.quads) {
            if (quad.predicate.value == this.path.value) {
                out.push(new SimpleIndex(quad.object, this.path));
                values.push(quad.object.value);
            }
        }

        for (let foo of foos) {
            this.strategy.add(foo, out, manager);
        }

        if (out.length == 0) {
            const msg = `Path nog found! ${this.path.value} in ${member.quads.map(x => x.predicate.value)}`
            console.error(msg)
        }

        return out;
    }
}

export interface BucketStrategy<Idx> {
    add(root: Idx[], newOnes: Idx[], manager: RelationManager<Idx>): void;
}

export class SimpleBucketStrategy implements BucketStrategy<SimpleIndex> {
    private readonly seenMembers: { [key: string]: SimpleIndex[] } = {};

    add(foo: SimpleIndex[], newOnes: SimpleIndex[], manager: RelationManager<SimpleIndex>): void {
        const root = foo.map(f => `${f.path.value}=${f.value.value}`).join("&");

        if (!this.seenMembers[root]) {
            this.seenMembers[root] = [];
        }

        for (let value of newOnes) {
            if (!this.seenMembers[root].some(idx => idx.value.value == value.value.value)) {
                this.seenMembers[root].forEach(m => manager.addRelation([...foo, m], value, RelationType.EqualThan));
                this.seenMembers[root].forEach(m => manager.addRelation([...foo, value], m, RelationType.EqualThan));
                this.seenMembers[root].push(value);
            }
        }
    }
}