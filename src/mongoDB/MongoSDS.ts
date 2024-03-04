import type * as RDF from '@rdfjs/types';
import { createUriAndTermNamespace, getLoggerFor, RedirectHttpError } from '@solid/community-server';
import { CacheDirectives, LDES, Member, RDF as RDFT, RelationParameters, RelationType, SDS, TREE } from "@treecg/types";
import { Collection, Db, Filter } from "mongodb";
import { DataFactory, Parser } from "n3";
import { View } from "../ldes/View";
import { Parsed, parseIndex, reconstructIndex } from '../util/utils';
import { DBConfig } from "./MongoDBConfig";
import { DataCollectionDocument, IndexCollectionDocument, MetaCollectionDocument } from "./MongoCollectionTypes";
import { Fragment } from "../ldes/Fragment";

const DCAT = createUriAndTermNamespace("http://www.w3.org/ns/dcat#", "endpointURL", "servesDataset");
const { namedNode, quad, blankNode, literal } = DataFactory;



class MongoSDSFragment implements Fragment {
  members: string[];
  relations: RelationParameters[];
  collection: Collection<DataCollectionDocument>;

  cacheDirectives: CacheDirectives;
  constructor(members: string[], relations: RelationParameters[], collection: Collection<DataCollectionDocument>, cacheDirectives: CacheDirectives) {
    this.collection = collection;
    this.members = members;
    this.relations = relations;
    this.cacheDirectives = cacheDirectives;
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
    return this.cacheDirectives;
  }
}

export class MongoSDSView implements View {
  protected readonly logger = getLoggerFor(this);

  dbConfig: DBConfig;
  db!: Db;
  metaCollection!: Collection<MetaCollectionDocument>;
  indexCollection!: Collection<IndexCollectionDocument>;
  dataCollection!: Collection<DataCollectionDocument>;
  roots!: string[];

  descriptionId?: string;
  streamId: string;

  freshDuration: number = 60;


  constructor(db: DBConfig, streamId: string, descriptionId?: string) {
    this.dbConfig = db;
    this.streamId = streamId;
    this.descriptionId = descriptionId;
    this.roots = [];
  }

  async init(base: string, prefix: string, freshDuration: number): Promise<void> {
    this.freshDuration = freshDuration;
    this.db = await this.dbConfig.db();
    this.metaCollection = this.db.collection(this.dbConfig.meta);
    this.indexCollection = this.db.collection(this.dbConfig.index);
    this.dataCollection = this.db.collection(this.dbConfig.data);

    const roots = await this.indexCollection.find({ root: true, streamId: this.streamId }).toArray();
    if ((await roots).length > 0) {
      for (const root of roots) {
        this.roots.push([base.replace(/^\/|\/$/g, ""), prefix.replace(/^\/|\/$/g, ""), root.id].join("/"));
      }
    } else {
      this.roots = [[base.replace(/^\/|\/$/g, ""), prefix.replace(/^\/|\/$/g, "")].join("/")];
    }
  }

  getCacheDirectives(isImmutable?: boolean): CacheDirectives {
    const immutable = !!isImmutable;
    const maxAge = immutable ? 604800 : this.freshDuration;
    return {
      pub: true,
      immutable: immutable,
      maxAge,
    }
  }

  getRoots(): string[] {
    return this.roots;
  }

  async getMetadata(ldes: string): Promise<[RDF.Quad[], RDF.Quad_Object]> {
    const quads = [];
    const blankId = this.descriptionId ? namedNode(this.descriptionId) : blankNode();
    for (const root of this.getRoots()) {
      quads.push(
        quad(blankId, RDFT.terms.type, TREE.terms.custom("ViewDescription")),
        quad(blankId, DCAT.terms.endpointURL, namedNode(root)),
        quad(blankId, DCAT.terms.servesDataset, namedNode(ldes)),
      );
    }

    const stream = await this.metaCollection.findOne({ "type": SDS.Stream, "id": this.streamId });
    if (stream) {
      quads.push(
        quad(blankId, LDES.terms.custom("managedBy"), namedNode(this.streamId)),
      );

      quads.push(...new Parser().parse(stream.value));
    }

    return [quads, blankId];
  }

  async getFragment(identifier: string): Promise<Fragment> {
    const { segs, query } = parseIndex(identifier);

    this.logger.error("ERROR ME");
    this.logger.info(`Getting fragment for segs ${segs} query ${query}`);
    console.log(`Getting fragment for segs ${JSON.stringify(segs)} query ${JSON.stringify(query)}`);

    const timestampValue = query["timestamp"];
    const members = [] as string[];
    const relations = <RelationParameters[]>[];

    const id = segs.join("/");
    console.log("Finding fragment for ", { streamId: this.streamId, id });
    const search: Filter<IndexCollectionDocument> = { streamId: this.streamId, id };

    if (timestampValue) {
      search.timeStamp = { "$lte": new Date(timestampValue) };
    }

    const fragment = await this.indexCollection.find(search).sort({ "timeStamp": -1 }).limit(1).next();
    if (!fragment) {
      this.logger.error("No such bucket found! " + JSON.stringify(search));
    } else {
      this.logger.info("No timestamp value was provided, but this view uses timestamps, thus redirecting");
      if(!timestampValue && fragment.timeStamp) {
        // Redirect to the correct resource, we now have the timestamp;
        query["timestamp"] = fragment.timeStamp!;
        const location = reconstructIndex({segs, query});
        throw new RedirectHttpError(307, "moved", location);
      }
      fragment.relations = fragment.relations || [];

      const rels: RelationParameters[] = fragment!.relations.map(({ type, value, bucket, path }) => {
        const index: Parsed = { segs: bucket.split("/"), query };
        const relation: RelationParameters = { type: <RelationType>type, nodeId: reconstructIndex(index) };

        if (value) {
          relation.value = [literal(value)];
        }
        if (path) {
          relation.path = namedNode(path);
        }

        return relation;
      });
      relations.push(...rels);
      members.push(...fragment.members || []);
    }

    return new MongoSDSFragment(members, relations, this.dataCollection, this.getCacheDirectives(fragment?.immutable));
  }
}

