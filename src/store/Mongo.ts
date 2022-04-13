
import { Member } from '@treecg/types';
import type * as RDF from '@rdfjs/types';
import * as mongoDB from 'mongodb';
import { CacheExtractor, IndexExtractor, PathExtractor, QuadExtractor, SimpleIndex } from '../extractor';
import { AlternativePath, FragmentFetcherBase } from '../Fetcher';
import { MemberStoreBase } from '../StreamWriter';
import { Tree, TreeData, TreeTwo } from '../Tree';
import { Wrapper } from '../types';
import { DataFactory } from 'rdf-data-factory';
import fetch from 'node-fetch';
import { MongoConnection } from '../MongoUtils';
import { DataSync } from '../DataSync';

export interface State {
    metadata: DataSync<any>,
    connection(name?: string): Promise<mongoDB.Collection>;
}

export class MongoData implements State {
    metadata: DataSync<any>;
    private readonly conn: MongoConnection;

    constructor(conn: MongoConnection, metadata: DataSync<any>) {
        this.conn = conn;
        this.metadata = metadata;
    }

    connection(collection?: string): Promise<mongoDB.Collection<mongoDB.Document>> {
        return this.conn.connection(collection);
    }
}

function parseNode(v: { termType: string, value: string }): RDF.Term | undefined {
    switch (v.termType) {
        case "NamedNode":
            return factory.namedNode(v.value);
        case "Literal":
            return factory.literal(v.value);
        case "BlankNode":
            return factory.blankNode(v.value);
        case "Variable":
            return factory.variable(v.value);
    }
}

const factory = new DataFactory();
function parseQuad(obj: any): RDF.Quad {
    return factory.quad(
        <RDF.Quad_Subject>parseNode(obj.subject),
        <RDF.Quad_Predicate>parseNode(obj.predicate),
        <RDF.Quad_Object>parseNode(obj.object),
        <RDF.Quad_Graph>parseNode(obj.graph),
    )
}

function makeKeyMongoProof(inp: string): string {
    return inp.replaceAll('.', '_', );
}

type Plain = { [label: string]: string }
type Doc = { id: RDF.Term, quads: RDF.Quad[], met: Plain };
export class MongoWriter<Idx extends SimpleIndex> extends MemberStoreBase<State, Idx> {
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[] = [], indexExtractors: IndexExtractor<Idx>[] = []) {
        super(state, extractors, indexExtractors);
    }
    async writeMetadata(metadata: any): Promise<void> {
        this.state.metadata.save(metadata);
    }

    async _add(quads: Member, tree: TreeData<Idx>): Promise<void> {
        const locations = await TreeTwo.walkTreeWith(tree, <Plain>{},
            async (index, c, node) => {
                const v = node.value!.value.value;
                const p = node.value!.path.value;


                const o: Plain = {};
                Object.assign(o, c);
                o[makeKeyMongoProof(p)] = v;

                if (TreeTwo.isLeaf(node)) {
                    return ["end", o];
                }
                return ["cont", o];
            }
        );

        const items = locations.map(loc => { return { id: quads.id, quads: quads.quads, met: loc } });
        const collection = await this.state.connection();
        await collection.insertMany(items);
    }
}

export class MongoFetcher<Idx extends SimpleIndex> extends FragmentFetcherBase<State, Idx> {
    constructor(state: Wrapper<State>, extractors: PathExtractor<Idx>[], cacheExtractor: CacheExtractor<Idx>) {
        super(state.inner, extractors, cacheExtractor);
    }

    async _getMetadata(): Promise<any> {
        return this.state.metadata.get();
    }

    async _fetch(indices: Idx[]): Promise<{ members: Member[]; relations: AlternativePath<Idx>[]; }> {
        const key = <Plain>{};
        console.log(indices);
        indices.forEach(i => key[makeKeyMongoProof(i.path.value)] = i.value.value);

        console.log("looking with", { met: key });


        const conn = await this.state.connection();
        const res = <Doc[]><unknown>await conn.find({ met: key }).toArray();

        console.log(res[0]?.quads[0]);

        const members = res.map(x => { return { id: x.id, quads: x.quads.map(parseQuad) } });

        return { members, relations: [] };
    }
} 
