import { BasicRepresentation, Conditions, guardedStreamFrom, INTERNAL_QUADS, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { FragmentFetcher, Member, StreamWriter } from "@treecg/types";
import arrayifyStream from "arrayify-stream";
import rdfParser, { ParseOptions } from "rdf-parse";
import { Readable } from "stream";
import { Initializable, ReadStream, StreamConstructor } from "./types";

export * from './fetcher';
export * from './memory';
export * from './streamWriter';
export * from './types';

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
        streamReader?.create().then(this.startStream.bind(this)).then(console.log);
    }

    async startStream(stream: Readable) {
        console.log("starting stream reading")

        stream._read(1);

        for await (const chunk of stream) {
            const options: ParseOptions = { contentType: "application/ld+json" };
            const quads = await arrayifyStream(rdfParser.parse(Readable.from(chunk), options));

            const member: Member = {
                "id": quads[0].subject,
                "quads": quads
            }
            // TODO: generically interpret chunk as triple
            this.streamWriter.write(member);
        }
    }

    resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
        return false;
    }

    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions | undefined): Promise<Representation> => {
        const fragment = await this.fragmentFetcher.fetch(identifier.path);

        console.log(`Found ${fragment.members.length} items`)
        console.log(fragment.relations);

        // TODO: add quads to represent ldes

        return new BasicRepresentation(
            guardedStreamFrom(fragment.members.flatMap(x => x.quads)),
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
