import type * as RDF from "@rdfjs/types";
import {
  createUriAndTermNamespace,
  getLoggerFor,
  RedirectHttpError,
} from "@solid/community-server";
import {
  CacheDirectives,
  LDES,
  Member,
  RDF as RDFT,
  RelationType,
  SDS,
  TREE,
} from "@treecg/types";
import { Collection, Db, Filter } from "mongodb";
import { DataFactory, NamedNode, Parser } from "n3";
import { View } from "../ldes/View";
import { Parsed, parseIndex, reconstructIndex } from "../util/utils";
import { DBConfig } from "./MongoDBConfig";
import {
  DataCollectionDocument,
  IndexCollectionDocument,
  MetaCollectionDocument,
  RelationCollectionDocument,
} from "./MongoCollectionTypes";
import { Fragment, RdfThing, RelationParameters } from "../ldes/Fragment";

const DCAT = createUriAndTermNamespace(
  "http://www.w3.org/ns/dcat#",
  "endpointURL",
  "servesDataset",
);
const { namedNode, quad, blankNode, literal } = DataFactory;

class MongoSDSFragment implements Fragment {
  members: string[];
  relations: RelationParameters[];
  collection: Collection<DataCollectionDocument>;

  cacheDirectives: CacheDirectives;
  constructor(
    members: string[],
    relations: RelationParameters[],
    collection: Collection<DataCollectionDocument>,
    cacheDirectives: CacheDirectives,
  ) {
    this.collection = collection;
    this.members = members;
    this.relations = relations;
    this.cacheDirectives = cacheDirectives;
  }

  async getMembers(): Promise<Member[]> {
    return await this.collection
      .find({ id: { $in: this.members } })
      .map((row) => {
        return <Member>{
          id: namedNode(row.id),
          quads: new Parser().parse(row.data),
        };
      })
      .toArray();
  }

  async getRelations(): Promise<RelationParameters[]> {
    return this.relations;
  }

  async getCacheDirectives(): Promise<CacheDirectives> {
    return this.cacheDirectives;
  }
}

function unpackRdfThing(input: string): RdfThing | undefined {
  const quads = new Parser().parse(input);
  console.log("parsed quads", quads.length);

  const idx = quads.findIndex((x) =>
    x.predicate.equals(new NamedNode("http://purl.org/dc/terms/subject")),
  );
  if (idx == -1) return;

  const subject = quads[idx].object;
  quads.splice(idx, 1);

  return {
    quads,
    id: subject,
  };
}

export class MongoSDSView implements View {
  protected readonly logger = getLoggerFor(this);

  dbConfig: DBConfig;
  db!: Db;
  metaCollection!: Collection<MetaCollectionDocument>;
  indexCollection!: Collection<IndexCollectionDocument>;
  dataCollection!: Collection<DataCollectionDocument>;
  relationCollection!: Collection<RelationCollectionDocument>;
  root!: string;

  descriptionId?: string;
  streamId: string;

  freshDuration: number;

  constructor(
    db: DBConfig,
    streamId: string,
    descriptionId?: string,
    freshDuration?: number,
  ) {
    this.dbConfig = db;
    this.streamId = streamId;
    this.descriptionId = descriptionId;
    this.freshDuration = freshDuration || 120;
  }

  async init(base: string, prefix: string): Promise<void> {
    this.db = await this.dbConfig.db();
    this.metaCollection = this.db.collection("META");
    this.indexCollection = this.db.collection("INDEX");
    this.dataCollection = this.db.collection("DATA");
    this.relationCollection = this.db.collection("RELATIONS");

    const root = await this.indexCollection.findOne({
      root: true,
      streamId: this.streamId,
    });
    if (root) {
      this.root = [
        base.replace(/^\/|\/$/g, ""),
        prefix.replace(/^\/|\/$/g, ""),
        root.id,
      ].join("/");
    } else {
      this.root = [
        base.replace(/^\/|\/$/g, ""),
        prefix.replace(/^\/|\/$/g, ""),
      ].join("/");
    }
  }

  getCacheDirectives(isImmutable?: boolean): CacheDirectives {
    const immutable = !!isImmutable;
    const maxAge = immutable ? 604800 : this.freshDuration;
    return {
      pub: true,
      immutable: immutable,
      maxAge,
    };
  }

  getRoot(): string {
    return this.root;
  }

  async getMetadata(ldes: string): Promise<[RDF.Quad[], RDF.Quad_Object]> {
    const quads = [];
    const blankId = this.descriptionId
      ? namedNode(this.descriptionId)
      : blankNode();
    quads.push(
      quad(blankId, RDFT.terms.type, TREE.terms.custom("ViewDescription")),
      quad(blankId, DCAT.terms.endpointURL, namedNode(this.getRoot())),
      quad(blankId, DCAT.terms.servesDataset, namedNode(ldes)),
    );

    const stream = await this.metaCollection.findOne({
      type: SDS.Stream,
      id: this.streamId,
    });
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
    console.log(
      `Getting fragment for segs ${JSON.stringify(segs)} query ${JSON.stringify(
        query,
      )}`,
    );

    const id = segs.map((x) => decodeURIComponent(x)).join("/");
    console.log("Finding fragment for ", { streamId: this.streamId, id });
    const search: Filter<IndexCollectionDocument> = {
      streamId: this.streamId,
      id,
    };
    const relationSearch: Filter<RelationCollectionDocument> = { from: id };

    const [fragment, relations] = await Promise.all([
      this.indexCollection.find(search).sort({ timeStamp: -1 }).limit(1).next(),
      this.relationCollection.find(relationSearch),
    ]);

    if (!fragment) {
      this.logger.error("No such bucket found! " + JSON.stringify(search));
      return new MongoSDSFragment(
        [],
        [],
        this.dataCollection,
        this.getCacheDirectives(undefined),
      );
    }
    const rels: RelationParameters[] = await relations
      .map(({ type, value, bucket, path }) => {
        const index: Parsed = { segs: bucket.split("/"), query: {} };
        const relation: RelationParameters = {
          type: <RelationType>type,
          nodeId: reconstructIndex(index),
        };

        if (value) {
          relation.value = unpackRdfThing(value);
        }
        if (path) {
          relation.path = unpackRdfThing(path);
        }

        return relation;
      })
      .toArray();

    return new MongoSDSFragment(
      fragment.members || [],
      rels,
      this.dataCollection,
      this.getCacheDirectives(fragment?.immutable),
    );
  }
}
