import { BasicRepresentation, Conditions, guardedStreamFrom, INTERNAL_QUADS, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { FragmentFetcher, Initializable, ReadStream,  RetentionPolicyImpl, StreamConstructor, StreamWriter } from "./types";
import { Readable } from "stream";
import { PojoConfig } from "./memory";


export * from './types'
export * from './fetcher'
export * from './streamWriter'
export * from './memory'

export class LDESStreamClient implements StreamConstructor {
    private url: string;
    private ldesClient: ReadStream;
    private init: Initializable;

    public constructor(url: string, ldesClient: ReadStream, init: Initializable) {
        this.url = url;
        this.ldesClient = ldesClient;
        this.init = init;
    }

    async create(): Promise<Readable> {
        await this.init.initialize();
        return this.ldesClient.createReadStream(this.url, {});
    }
}


export class LDESAccessorBasedStore implements ResourceStore {
    fragmentFetcher: FragmentFetcher;
    streamWriter: StreamWriter;

    constructor(
        fragmentFetcher: FragmentFetcher,
        streamWriter: StreamWriter,
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

        streamReader?.create().then(this.startStream.bind(this)).then(console.log);
    }

    async startStream(stream: Readable) {
        console.log("starting stream reading")
        const config = new PojoConfig();

        stream._read(1);

        for await (const chunk of stream) {
            const quads = config.toQuad(JSON.parse(chunk));
            // TODO: generically interpret chunk as triple
            this.streamWriter.push(quads, new RetentionPolicyImpl());
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
