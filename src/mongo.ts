
import type * as RDF from '@rdfjs/types';
import { createUriAndTermNamespace, getLoggerFor } from '@solid/community-server';
import { Member, RelationParameters, RelationType, SDS, RDF as RDFT, TREE, CacheDirectives, LDES } from "@treecg/types";
import { Collection, Db, Filter, MongoClient } from "mongodb";
import { DataFactory, Parser } from "n3";

import { Fragment, View } from ".";
import { Parsed, parseIndex, reconstructIndex } from './utils';

const DCAT = createUriAndTermNamespace("http://www.w3.org/ns/dcat#", "endpointURL", "servesDataset");
const { namedNode, quad, blankNode, literal } = DataFactory;

type DataCollectionDocument = {
  id: string,
  data: string,
  timestamp?: string,
};

type MetaCollectionDocument = {
  id: string, value: string, type: string
};

type IndexCollectionDocument = {
  id?: string,
  streamId: string,
  leaf: boolean,
  value?: string,
  relations: { type: RelationType, value: string, bucket: string, path: string }[],
  members?: string[],
  count: number,
  timeStamp?: string
};

export class DBConfig {
  readonly url: string;
  readonly meta: string;
  readonly data: string;
  readonly index: string;

  _client: MongoClient;
  _clientInit: any;

  constructor(metaCollection: string, membersCollection: string, indexCollection: string, dbUrl?: string) {
    this.meta = metaCollection;
    this.data = membersCollection;
    this.index = indexCollection;

    this.url = dbUrl || "mongodb://localhost:27017/ldes";
    this._client = new MongoClient(this.url);
    this._clientInit = this._client.connect();
  }

  async db(): Promise<Db> {
    await this._clientInit;
    return this._client.db();
  }
}

class MongoFragment implements Fragment {
  members: string[];
  relations: RelationParameters[];
  collection: Collection<DataCollectionDocument>;
  constructor(members: string[], relations: RelationParameters[], collection: Collection<DataCollectionDocument>) {
    this.collection = collection;
    this.members = members;
    this.relations = relations;
  }

  async getMembers(): Promise<Member[]> {
    return await this.collection.find({ id: { $in: this.members } })
      .map(row => { return <Member>{ id: namedNode(row.id), quads: new Parser().parse(row.data) } })
      .toArray();
  }

  async getRelations(): Promise<RelationParameters[]> {
    return this.relations;
  }

  async getCacheDirectives(): Promise<CacheDirectives> {
    return { pub: true };
  }
}

export class MongoView implements View {
  protected readonly logger = getLoggerFor(this);

  dbConfig: DBConfig;
  db!: Db;
  metaCollection!: Collection<MetaCollectionDocument>;
  indexCollection!: Collection<IndexCollectionDocument>;
  dataCollection!: Collection<DataCollectionDocument>;
  root!: string;

  descriptionId?: string;
  streamId: string;


  constructor(db: DBConfig, streamId: string, descriptionId?: string) {
    this.dbConfig = db;
    this.streamId = streamId;
    this.descriptionId = descriptionId;
  }

  async init(base: string, prefix: string): Promise<void> {
    this.db = await this.dbConfig.db();
    this.metaCollection = this.db.collection(this.dbConfig.meta);
    this.indexCollection = this.db.collection(this.dbConfig.index);
    this.dataCollection = this.db.collection(this.dbConfig.data);

    this.root = [base.replace(/^\/|\/$/g, ""), prefix.replace(/^\/|\/$/g, "")].join("/");
  }

  getRoot(): string {
    return this.root;
  }

  async getMetadata(ldes: string): Promise<RDF.Quad[]> {
    /*
ex:BasicFragmentation a tree:ViewDescription ;
    dcat:endpointURL </basic> ;
    dcat:servesDataset ex:MyLDES ; # the LDES
    ldes:managedBy ex:LDESStream.
     */

    const quads = [];
    const blankId = this.descriptionId ? namedNode(this.descriptionId) : blankNode();
    quads.push(
      quad(blankId, RDFT.terms.type, TREE.terms.custom("ViewDescription")),
      quad(blankId, DCAT.terms.endpointURL, namedNode(this.getRoot())),
      quad(blankId, DCAT.terms.servesDataset, namedNode(ldes)),
    );

    const stream = await this.metaCollection.findOne({ "type": SDS.Stream, "id": this.streamId });
    if (stream) {
      quads.push(
        quad(blankId, LDES.terms.custom("managedBy"), namedNode(this.streamId)),
      );

      quads.push(...new Parser().parse(stream.value));
    }

    return quads;
  }

  async getFragment(identifier: string): Promise<Fragment> {
    const { segs, query } = parseIndex(identifier);

    this.logger.error("ERROR ME");
    this.logger.info(`Getting fragment for segs ${segs} query ${query}`);
    console.log(`Getting fragment for segs ${JSON.stringify(segs)} query ${JSON.stringify(query)}`);

    // [a,b,c] => [[a], [a,b], [a,b,c]]
    const indices = segs.reduce((cum, _, i, arr) => [...cum, arr.slice(0, i + 1)], <string[][]>[]);
    const timestampValue = query["timestamp"];
    const members = [] as string[];
    const relations = <RelationParameters[]>[];

    // Look for members and relations in path to leaf
    for (let i = 0; i < indices.length; i++) {
      const id = indices[i].join("/");

      const fragment = await this.indexCollection.findOne({ streamId: this.streamId, id, leaf: false });
      if (!fragment) continue;

      const rels: RelationParameters[] = fragment!.relations.map(({ type, value, bucket, path }) => {
        const values: RDF.Term[] = [literal(value)];

        const index: Parsed = { segs: segs.slice(), query: {} };
        index.segs[i] = bucket;

        return { type: <RelationType>type, value: values, nodeId: reconstructIndex(index), path: namedNode(path) };
      });

      relations.push(...rels);
      members.push(...fragment.members || []);
    }

    const id = segs.join("/");
    const search: Filter<IndexCollectionDocument> = { streamId: this.streamId, id, leaf: true };

    if (timestampValue)
      search.timeStamp = { "$lte": timestampValue };

    const actualTimestampBucket = await this.indexCollection.find(search).sort({ "timeStamp": -1 }).limit(1).next();
    if (!actualTimestampBucket) {
      this.logger.error("No such bucket found! " + JSON.stringify(search));
    } else {
      members.push(...actualTimestampBucket.members || []);

      const rels: RelationParameters[] = actualTimestampBucket!.relations.map(({ type, value, bucket, path }) => {
        const index: Parsed = { segs, query };
        index.query["timestamp"] = bucket;
        const values: RDF.Term[] = [literal(value)];

        return { type: <RelationType>type, value: values, nodeId: reconstructIndex(index), path: namedNode(path) };
      });

      relations.push(...rels);
    }

    return new MongoFragment(members, relations, this.dataCollection);
  }
}

