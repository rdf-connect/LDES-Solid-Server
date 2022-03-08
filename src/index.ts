import { BasicRepresentation, Conditions, guardedStreamFrom, INTERNAL_QUADS, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { RetentionPolicyImpl, StreamConstructor, StreamWriter } from "./types";
import * as N3 from "n3";
import { Fragment, FragmentFetcher } from "./fragments";
import { PojoConfig, Store } from "./memory";
import { Readable } from "stream";
import { IEventStreamArgs } from "@treecg/actor-init-ldes-client/lib/EventStream";
import { ILDESClientArgs, LDESClient } from "@treecg/actor-init-ldes-client";



export class LDESStreamClient implements StreamConstructor {
  private url: string;
  private ldesClient: LDESClient;
  
  public constructor(url: string, ldesClient: LDESClient) {
    this.url = url;
    this.ldesClient = ldesClient;
  }

  async create(): Promise<Readable> {
    return this.ldesClient.createReadStream(this.url, {});
  }
}

export class LDESAccessorBasedStore implements ResourceStore {

  fragmentFetcher: FragmentFetcher<any>;
  streamWriter: StreamWriter<N3.Quad[]>;

  constructor(
    fragmentFetcher: FragmentFetcher<any>,
    streamWriter: StreamWriter<N3.Quad[]>,
    streamReader?: StreamConstructor,
  ) {
    this.streamWriter = streamWriter;
    this.fragmentFetcher = fragmentFetcher;

    const config = new PojoConfig();

    this.streamWriter.push(config.toQuad({ x: 5, y: 6 }), new RetentionPolicyImpl())
    this.streamWriter.push(config.toQuad({ x: 5, y: 7 }), new RetentionPolicyImpl())
    this.streamWriter.push(config.toQuad({ x: 5, y: 8 }), new RetentionPolicyImpl())
    this.streamWriter.push(config.toQuad({ x: 6, y: 6 }), new RetentionPolicyImpl())
    this.streamWriter.push(config.toQuad({ x: 6, y: 7 }), new RetentionPolicyImpl())
    this.streamWriter.push(config.toQuad({ x: 6, y: 8 }), new RetentionPolicyImpl())

    streamReader?.create().then(this.startStream.bind(this));
  }

  async startStream(stream: Readable) {
    for await (const chunk of stream) {
      console.log("stream chunk:")
      console.log(chunk);
    }
  }

  resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
    return false;
  }

  getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions | undefined): Promise<Representation> => {
    const fragment = await this.fragmentFetcher.fetch(identifier);

    // TODO: add quads to represent ldes

    return new BasicRepresentation(
      guardedStreamFrom(fragment.members),
      new RepresentationMetadata(INTERNAL_QUADS)
    );
  }

  setRepresentation = async (identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    console.log("Set representation", identifier, representation, conditions)
    throw "Not implemented set"
  }

  addResource = async (container: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier> => {
    console.log("Add representation", container, representation, conditions)
    throw "Not implemented add"
  }

  deleteResource = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    console.log("Delete representation", identifier, conditions)
    throw "Not implemented delete"
  }

  modifyResource = async (identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    console.log("Modify representation", identifier, patch, conditions)
    throw "Not implemented modify"
  }
}

export * from './memory'
export * from './types'
export * from './fragments'