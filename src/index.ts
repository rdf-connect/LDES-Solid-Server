import { IActionRdfMetadataExtract, IActorRdfMetadataExtractOutput } from "@comunica/bus-rdf-metadata-extract";
import { ActionObserver, Actor, IActionObserverArgs, IActorTest } from "@comunica/core";
import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, Conditions, guardedStreamFrom, INTERNAL_QUADS, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { EventStream, LDESClient } from "@treecg/actor-init-ldes-client";
import { FragmentFetcher, StreamWriter } from "@treecg/types";
import { DataFactory, Quad } from "rdf-data-factory";
import { Initializable, StreamConstructor, NS } from "./types";

const { Tree, LDES } = NS;

export * from './memory';
export * from './streamWriter';
export * from './types';
export * from './fetcher';

type QuadMap = Record<string, RDF.Term[]>;
class Test extends ActionObserver<IActionRdfMetadataExtract, IActorRdfMetadataExtractOutput> {

    private id?: string
    private readonly excluded: string[];
    private handlers: ((metadata: QuadMap) => void)[] = [];

    public constructor(args: IActionObserverArgs<IActionRdfMetadataExtract, IActorRdfMetadataExtractOutput>, excluded: string[]) {
        super(args)
        this.excluded = excluded;
    }

    async onRun(actor: Actor<IActionRdfMetadataExtract, IActorTest, IActorRdfMetadataExtractOutput>, action: IActionRdfMetadataExtract, output: Promise<IActorRdfMetadataExtractOutput>): Promise<void> {
        const data: Record<string, QuadMap> = {};
        const handler = this.id == undefined ? this.onDataFull(data) : this.onDataWithId(data, this.id);
        action.metadata.on("data", handler);

        action.metadata.on("end", () => {
            if (this.id) {
                this.handlers.forEach(x => x(data[this.id!]))
            }
        })
    }

    private onDataFull(data: Record<string, QuadMap>): (quad: RDF.Quad) => void {
        return (quad: RDF.Quad) => {
            if (this.excluded.includes(quad.predicate.value)) return;
            this.addQuad(data, quad);

            if (quad.predicate.value == NS.Type && quad.object.value == LDES.EventStream) {
                console.log(quad)
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

    public on(metadata: "metadata", handler: (metadata: QuadMap) => void) {
        this.handlers.push(handler);
    }
}

export class LDESStreamClient implements StreamConstructor {
    private url: string;
    private ldesClient: LDESClient;
    private test: Test;

    public constructor(url: string, ldesClient: LDESClient, init: Initializable) {
        const excluded = [
            Tree.Member,
            Tree.View,
        ];

        this.test = new Test({ name: "test", bus: ldesClient.mediatorRdfMetadataExtractTree.bus }, excluded);
        this.url = url;
        this.ldesClient = ldesClient;
        this.ldesClient.mediatorRdfMetadataExtractTree.bus.subscribeObserver(
            this.test
        )
        init.initialize();
    }

    async create(): Promise<EventStream> {
        return this.ldesClient.createReadStream(this.url, { representation: "Quads", disablePolling: true });
    }

    on(metadata: "metadata", handler: (metadata: QuadMap) => void) {
        this.test.on(metadata, handler);
    }
}


export class LDESAccessorBasedStore implements ResourceStore {
    private readonly factory = new DataFactory();
    fragmentFetcher: FragmentFetcher;
    streamWriter: StreamWriter;
    metadata: QuadMap = {};
    private readonly id: string;

    constructor(
        fragmentFetcher: FragmentFetcher,
        streamWriter: StreamWriter,
        id: string,
        streamReader?: LDESStreamClient,
    ) {
        this.id = id;
        this.streamWriter = streamWriter;
        this.fragmentFetcher = fragmentFetcher;
        if (streamReader) {
            streamReader.create().then(this.startStream.bind(this)).then(console.log);
            streamReader.on("metadata", (metadata) => this.metadata = metadata);
        }
    }

    async startStream(stream: EventStream) {
        console.log("Event names", stream.eventNames());
        stream.on("data", async member => {
            this.streamWriter.write(member);
        });
    }

    resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
        return false;
    }

    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions | undefined): Promise<Representation> => {
        const fragment = await this.fragmentFetcher.fetch(identifier.path);

        const quads = [];

        quads.push(this.factory.quad(
            this.factory.namedNode(this.id),
            this.factory.namedNode(Tree.View),
            this.factory.namedNode(identifier.path)
        ));

        const meta = this.metadata;
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

        fragment.relations.forEach(r => {
            const blankNode = this.factory.blankNode();
            quads.push(this.factory.quad(
                this.factory.namedNode(identifier.path),
                this.factory.namedNode(Tree.Relation),
                blankNode
            ));

            quads.push(this.factory.quad(
                blankNode,
                this.factory.namedNode(NS.Type),
                this.factory.namedNode(r.type)
            ))

            quads.push(this.factory.quad(
                blankNode,
                this.factory.namedNode(Tree.Node),
                this.factory.namedNode(r.nodeId)
            ))

            if (r.path)
                quads.push(this.factory.quad(
                    blankNode,
                    this.factory.namedNode(Tree.Path),
                    <RDF.Quad_Object>r.path
                ))

            if (r.value)
                r.value.forEach(value =>
                    quads.push(this.factory.quad(
                        blankNode,
                        this.factory.namedNode(Tree.Value),
                        <RDF.Quad_Object>value
                    ))
                )
        });

        fragment.members.forEach(m => quads.push(
            this.factory.quad(
                this.factory.namedNode(this.id),
                this.factory.namedNode(Tree.Member),
                <RDF.Quad_Object>m.id
            )
        ));


        fragment.members.forEach(m => quads.push(...m.quads));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
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
