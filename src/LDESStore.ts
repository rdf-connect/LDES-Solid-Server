
import { IActionRdfMetadataExtract, IActorRdfMetadataExtractOutput } from "@comunica/bus-rdf-metadata-extract";
import { Bus, IActorArgs, IActorTest } from "@comunica/core";
import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, Conditions, CONTENT_TYPE, guardedStreamFrom, INTERNAL_QUADS, MetadataRecord, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { EventStream, LDESClient } from "@treecg/actor-init-ldes-client";
import { ActorRdfMetadataExtractTree } from "@treecg/actor-rdf-metadata-extract-tree";
import { CacheDirectives, FragmentFetcher, Member, RelationParameters, StreamWriter } from "@treecg/types";
import { DataFactory, Quad } from "rdf-data-factory";
import { HTTP } from ".";
import { cacheToLiteral, NS, StreamConstructor } from "./types";

const { Tree, LDES } = NS;

type QuadMap = Record<string, RDF.Term[]>;
interface FooArgs extends IActorArgs<IActionRdfMetadataExtract, IActorTest, IActorRdfMetadataExtractOutput> {
    bus: Bus<ActorRdfMetadataExtractTree, IActionRdfMetadataExtract, IActorTest, IActorRdfMetadataExtractOutput>;
    excluded: string[];
}

export class EventStreamMetadataExtractor extends ActorRdfMetadataExtractTree {
    private id?: string
    private readonly excluded: string[];
    constructor(args: FooArgs) {
        super(args);
        this.excluded = args.excluded;
    }

    async run(action: IActionRdfMetadataExtract): Promise<IActorRdfMetadataExtractOutput> {
        const data: Record<string, QuadMap> = {};
        const handler = this.id == undefined ? this.onDataFull(data) : this.onDataWithId(data, this.id);
        action.metadata.on("data", handler);

        const out = await super.run(action);

        out.metadata["mine"] = data[this.id!];
        return out;
    }

    private onDataFull(data: Record<string, QuadMap>): (quad: RDF.Quad) => void {
        return (quad: RDF.Quad) => {
            if (this.excluded.includes(quad.predicate.value)) return;
            this.addQuad(data, quad);

            if (quad.predicate.value == NS.Type && quad.object.value == LDES.EventStream) {
                this.id = quad.subject.value;
            }
        };
    }

    private onDataWithId(data: Record<string, QuadMap>, id: string): (quad: RDF.Quad) => void {
        return (quad: RDF.Quad) => {
            if (this.excluded.includes(quad.predicate.value)) return;
            if (quad.subject.value == id) {
                this.addQuad(data, quad);
            }
        };
    }

    private addQuad(data: Record<string, QuadMap>, quad: RDF.Quad) {
        const subject = quad.subject.value;
        const predicate = quad.predicate.value;
        const subjectProperties = data[subject] || (data[subject] = {});
        const objects = subjectProperties[predicate] || (subjectProperties[predicate] = []);
        objects.push(quad.object);
    }
}

export class LDESStreamClient implements StreamConstructor {
    private readonly url: string;
    private readonly ldesClient: LDESClient;
    // private metadataExtractor: EventStreamMetadataExtractor;

    public constructor(url: string, ldesClient: LDESClient, init: any) {
        this.url = url;
        this.ldesClient = ldesClient;
        // init.initialize();
    }

    async create(): Promise<EventStream> {
        return this.ldesClient.createReadStream(this.url, { representation: "Quads", disablePolling: true });
    }
}

export class LDESAccessorBasedStore implements ResourceStore {
    private readonly factory = new DataFactory();
    private readonly id: string;
    private readonly fragmentFetcher: FragmentFetcher;
    private readonly streamWriter: StreamWriter;

    private metadata: QuadMap = {};

    constructor(
        id: string,
        fragmentFetcher: FragmentFetcher,
        streamWriter: StreamWriter,
        streamReader?: LDESStreamClient,
    ) {
        this.id = id;
        this.fragmentFetcher = fragmentFetcher;
        this.streamWriter = streamWriter;
        if (streamReader) {
            streamReader.create().then(this.startStream.bind(this)).then(console.log);
        }
    }

    async startStream(stream: EventStream) {
        stream.on("data", async member => {
            this.streamWriter.write(member);
        });
        stream.on("metadata", metadata => this.metadata = metadata.mine);
    }

    resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
        return false;
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return { [CONTENT_TYPE]: INTERNAL_QUADS };

        const cacheLit = cacheToLiteral(cache);
        return { [HTTP.cache_control]: this.factory.literal(cacheLit), [CONTENT_TYPE]: INTERNAL_QUADS };
    }
    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions): Promise<Representation> => {
        console.log("Getting representation for ", identifier);
        const fragment = await this.fragmentFetcher.fetch(identifier.path);

        const quads: Array<RDF.Quad> = [];

        quads.push(this.factory.quad(
            this.factory.namedNode(this.id),
            this.factory.namedNode(Tree.View),
            this.factory.namedNode(identifier.path)
        ));

        this.addMeta(quads, this.metadata);

        fragment.relations.forEach(relation => this.addRelations(quads, identifier.path, relation));
        fragment.members.forEach(m => this.addMember(quads, m));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
            new RepresentationMetadata(this.getMetadata(fragment.cache))
        );
    }

    addRelations(quads: Array<RDF.Quad>, identifier: string, relation: RelationParameters) {
        const blankNode = this.factory.blankNode();
        quads.push(this.factory.quad(
            this.factory.namedNode(identifier),
            this.factory.namedNode(Tree.Relation),
            blankNode
        ));

        quads.push(this.factory.quad(
            blankNode,
            this.factory.namedNode(NS.Type),
            this.factory.namedNode(relation.type)
        ))

        quads.push(this.factory.quad(
            blankNode,
            this.factory.namedNode(Tree.Node),
            this.factory.namedNode(relation.nodeId)
        ))

        if (relation.path)
            quads.push(this.factory.quad(
                blankNode,
                this.factory.namedNode(Tree.Path),
                <RDF.Quad_Object>relation.path
            ))

        if (relation.value)
            relation.value.forEach(value =>
                quads.push(this.factory.quad(
                    blankNode,
                    this.factory.namedNode(Tree.Value),
                    <RDF.Quad_Object>value
                ))
            )
    }

    addMember(quads: Array<Quad>, member: Member) {
        quads.push(this.factory.quad(
            this.factory.namedNode(this.id),
            this.factory.namedNode(Tree.Member),
            <RDF.Quad_Object>member.id
        ));
        quads.push(...member.quads)
    }

    addMeta(quads: Array<Quad>, meta: QuadMap) {
        for (let key in meta) {
            for (let object of meta[key]) {
                quads.push(
                    this.factory.quad(
                        this.factory.namedNode(this.id),
                        this.factory.namedNode(key),
                        <RDF.Quad_Object>object,
                    )
                )
            }
        }
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
