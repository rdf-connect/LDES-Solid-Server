
import type * as RDF from '@rdfjs/types';
import { Member, RelationType } from '@treecg/types';
import * as mongoDB from 'mongodb';
import { DataFactory } from 'rdf-data-factory';
import { DataSync } from '../DataSync';
import { CacheExtractor, IndexExtractor, PathExtractor, QuadExtractor, SimpleIndex } from '../extractor';
import { AlternativePath, FragmentFetcherBase } from '../Fetcher';
import { MemberStoreBase } from '../StreamWriter';
import { Tree, TreeData } from '../Tree';
import { Wrapper } from '../types';

export class MongoDataSync<T> implements DataSync<T | undefined> {
    private readonly collection: Promise<mongoDB.Collection>;
    private readonly id: string;
    constructor(connection: MongoConnection, collection: string, id: string) {
        this.collection = connection.connection(collection);
        this.id = id;
    }

    async update(f: (value: T | undefined) => Promise<T>): Promise<void> {
        const v = await this.get();
        await this.save(await f(v));
    }

    async get(): Promise<T | undefined> {
        const collection = await this.collection;
        const item = await collection.findOne({ id: this.id });
        if (item) {
            return item.data;
        }
    }

    async save(t: T): Promise<void> {
        const collection = await this.collection;
        await collection.updateOne({ id: this.id }, { $set: { data: t } }, { upsert: true });
    }

}

export class MongoConnection {
    private readonly db: Promise<mongoDB.Db>;
    private readonly defaultCollection: string;

    constructor(conn = "mongodb://localhost:27017", dbName = "local", collection = "gemeenten_enzo") {
        this.defaultCollection = collection;
        this.db = new Promise(async (res) => {
            const client: mongoDB.MongoClient = new mongoDB.MongoClient(conn);
            await client.connect();

            res(client.db(dbName));
        });
    }

    connection(collection?: string): Promise<mongoDB.Collection<mongoDB.Document>> {
        const colName = collection || this.defaultCollection;
        return this.db.then(db => db.collection(colName))
    }
}

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


// Dots have a special meaning in mongoDB better replace with underscore
function makeKeyMongoProof(inp: string): string {
    return inp.replaceAll('.', '_');
}

function appendToRoot(root: string, key: string, value: string): string {
    return `${root}&${key}=${value}`;
}

// Plain dictionairy
type Plain = { [label: string]: string }

// MongoDB Document type
type Doc = { id: RDF.Term, quads: RDF.Quad[], keys: Plain };


export class MongoWriter<Idx extends SimpleIndex> extends MemberStoreBase<State, Idx> {
    constructor(state: Wrapper<State>, extractors: QuadExtractor<Idx>[] = [], indexExtractors: IndexExtractor<Idx>[] = []) {
        super(state, extractors, indexExtractors);
    }

    async writeMetadata(metadata: any): Promise<void> {
        this.state.metadata.save(metadata);
    }

    async _add(quads: Member, tree: TreeData<Idx>): Promise<void> {
        const indices: { root: string, value: string, index: Idx }[] = [];

        type Keys = { "keys": Plain, "root": string }
        const locations = await Tree.walkTreeWith(tree, <Keys>{ keys: {}, root: "" },
            async (index, keys, node) => {
                const value = node.value!.value.value;
                const property = makeKeyMongoProof(node.value!.path.value);

                indices.push({ root: keys.root, value: value, index: node.value! });
                const newroot = appendToRoot(keys.root, property, value);

                const newKeys: Keys = { keys: {}, root: newroot };

                // make sure to copy keys
                Object.assign(newKeys.keys, keys);
                newKeys.keys[property] = value;

                return [Tree.isLeaf(node) ? "end" : "cont", newKeys];
            }
        );

        const metaDoc = await this.state.connection("metaDoc");
        const metadataUpdates = indices.map(foo => metaDoc.updateOne(foo, { $set: {} }, { upsert: true }));

        const items = locations.map(loc => { return { id: quads.id, quads: quads.quads, met: loc.keys } });
        const collection = await this.state.connection();

        const itemInserts = collection.insertMany(items);

        await Promise.all([metadataUpdates, itemInserts]);
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
        const res = <Doc[]><unknown>await conn.find({ keys: key }).toArray();

        console.log(res[0]?.quads[0]);

        const members = res.map(x => { return { id: x.id, quads: x.quads.map(parseQuad) } });

        return { members, relations: alterantives.flat() };
    }
} 
