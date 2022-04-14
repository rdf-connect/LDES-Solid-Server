
import { Member, RelationType } from '@treecg/types';
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
    return inp.replaceAll('.', '_');
}

function appendToRoot(root: string, key: string, value: string): string {
    return `${root}&${key}=${value}`;
}

type Foo<Idx> = { "keys": Plain, "root": string }
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
        const foos: { root: string, value: string, index: Idx }[] = [];

        const locations = await TreeTwo.walkTreeWith(tree, <Foo<Idx>>{ keys: {}, root: "" },
            async (index, c, node) => {
                const v = node.value!.value.value;
                const p = makeKeyMongoProof(node.value!.path.value);

                foos.push({ root: c.root, value: v, index: node.value! });
                const newroot = appendToRoot(c.root, p, v);

                const o: Foo<Idx> = { keys: {}, root: newroot };
                Object.assign(o.keys, c);
                o.keys[p] = v;

                if (TreeTwo.isLeaf(node)) {
                    return ["end", o];
                }

                return ["cont", o];
            }
        );

        const metaDoc = await this.state.connection("metaDoc");

        for (let foo of foos) {
            metaDoc.updateOne(foo, { $set: {} }, { upsert: true });
        }

        const items = locations.map(loc => { return { id: quads.id, quads: quads.quads, met: loc.keys } });
        const collection = await this.state.connection();
        await collection.insertMany(items);
    }
}

export class MongoFetcher<Idx extends SimpleIndex> extends FragmentFetcherBase<State, Idx> {
    private readonly factory = new DataFactory();
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

        let root = "";
        const keyParts = [];
        for (let index of indices) {
            const v = index.value.value;
            const p = makeKeyMongoProof(index.path.value);
            keyParts.push({ root: root, value: v, index: index })

            root = appendToRoot(root, p, v);
        }

        console.log("looking with", { met: key });

        const metaDoc = await this.state.connection("metaDoc");
        const alterantives: AlternativePath<Idx>[][] = await Promise.all(keyParts.flatMap(async (part, i) => {
            const toAlternative = (meta: { value: string, index: Idx }, rel: RelationType) => {
                return {
                    index: meta.index,
                    type: rel,
                    from: i,
                    path: part.index.useInRelation ? part.index.path : undefined,
                    value: part.index.useInRelation ? [this.factory.literal(meta.value)] : []
                }
            };

            const os: Array<AlternativePath<Idx> | undefined> = await Promise.all([
                metaDoc.findOne({ root: part.root, value: { $gt: part.value } }, { sort: { value: 1 }, limit: 1 })
                    .then(x => x ? toAlternative(<any>x, RelationType.GreaterThan) : undefined),
                metaDoc.findOne({ root: part.root, value: { $lt: part.value } }, { sort: { value: -1 }, limit: 1 })
                    .then(x => x ? toAlternative(<any>x, RelationType.LessThan) : undefined),
            ]);

            return <AlternativePath<Idx>[]>os.filter(x => !!x);
        }));


        const conn = await this.state.connection();
        const res = <Doc[]><unknown>await conn.find({ met: key }).toArray();

        console.log(res[0]?.quads[0]);

        const members = res.map(x => { return { id: x.id, quads: x.quads.map(parseQuad) } });

        return { members, relations: alterantives.flat() };
    }
} 
