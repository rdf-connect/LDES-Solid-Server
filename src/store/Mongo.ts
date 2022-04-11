
import { Member } from '@treecg/types';
import type * as RDF from '@rdfjs/types';
import * as mongoDB from 'mongodb';
import { CacheExtractor, IndexExtractor, PathExtractor, QuadExtractor, SimpleIndex } from '../extractor';
import { AlternativePath, FragmentFetcherBase } from '../Fetcher';
import { MemberStoreBase } from '../StreamWriter';
import { Tree } from '../Tree';
import { Wrapper } from '../types';
import { DataFactory } from 'rdf-data-factory';


export interface State {
    metadata: any,
    connection(): Promise<mongoDB.Collection>;
}

export class MongoData implements State {
    metadata: any = {};
    private readonly conn: Promise<mongoDB.Collection<mongoDB.Document>>;

    constructor(conn = "mongodb://localhost:27017", dbName = "local", collection = "gemeenten_enzo") {
        this.conn = new Promise(async (res) => {
            const client: mongoDB.MongoClient = new mongoDB.MongoClient(conn);
            await client.connect();

            const db: mongoDB.Db = client.db(dbName);

            const coll: mongoDB.Collection = db.collection(collection);

            res(coll);
        })
    }

    connection(): Promise<mongoDB.Collection<mongoDB.Document>> {
        return this.conn;
    }
}

const factory = new DataFactory();
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

function parseQuad(obj: any): RDF.Quad {

    return factory.quad(
        <RDF.Quad_Subject>parseNode(obj.subject),
        <RDF.Quad_Predicate>parseNode(obj.predicate),
        <RDF.Quad_Object>parseNode(obj.object),
        <RDF.Quad_Graph>parseNode(obj.graph),
    )

}

type Plain = { [label: string]: string }
type Doc = { id: RDF.Term, quads: RDF.Quad[], met: Plain };
export class MongoWriter<Idx extends SimpleIndex> extends MemberStoreBase<State, Idx> {
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[] = [], indexExtractors: IndexExtractor<Idx>[] = []) {
        super(state, extractors, indexExtractors);
    }
    async writeMetadata(metadata: any): Promise<void> {
        this.state.metadata = metadata;
    }

    async _add(quads: Member, tree: Tree<Idx, void>): Promise<void> {
        const locations = await tree.walkTreeWith(<Plain>{},
            async (index, c, node) => {
                const v = index.value.value;
                const p = index.path.value;

                const o = Object.assign({}, c);
                o[p] = v;

                if (node.isLeaf()) {
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
        return this.state.metadata;
    }

    async _fetch(indices: Idx[]): Promise<{ members: Member[]; relations: AlternativePath<Idx>[]; }> {
        const key = <Plain>{};
        console.log(indices);
        indices.forEach(i => key[i.path.value] = i.value.value);

        console.log("looking with", { met: key });

        const conn = await this.state.connection();
        const res = <Doc[]><unknown>await conn.find({ met: key }).toArray();

        console.log(res[0]?.quads[0]);

        const members = res.map(x => { return { id: x.id, quads: x.quads.map(parseQuad) } });

        return { members, relations: [] };
    }

} 