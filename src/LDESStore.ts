
import { StreamReader } from "@connectors/types";
import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, Conditions, CONTENT_TYPE, guardedStreamFrom, INTERNAL_QUADS, MetadataRecord, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";
import { CacheDirectives, FragmentFetcher, Member, MemberStore, Metadata, RelationParameters } from "@treecg/types";
import { DataFactory, Quad } from "rdf-data-factory";
import { HTTP } from ".";
import { cacheToLiteral, NS } from "./types";

const { Tree, LDES } = NS;

type QuadMap = Record<string, RDF.Term[]>;

export class LDESAccessorBasedStore implements ResourceStore {
    private readonly factory = new DataFactory();
    private readonly id: string;
    private readonly fragmentFetcher: FragmentFetcher;
    private readonly streamWriter: MemberStore;

    constructor(
        id: string,
        fragmentFetcher: FragmentFetcher,
        streamWriter: MemberStore,
        streamReader?: StreamReader<Member, Metadata>,
    ) {
        this.id = id;
        this.fragmentFetcher = fragmentFetcher;
        this.streamWriter = streamWriter;
        if (streamReader) {
            streamReader.getMetadataStream().on("data", meta => this.streamWriter.writeMetadata(meta))
            streamReader.getStream().on("data", member => this.streamWriter.write(member));
        }
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
        const metadata = fragment.metadata;
        const quads: Array<RDF.Quad> = [];

        quads.push(this.factory.quad(
            this.factory.namedNode(this.id),
            this.factory.namedNode(Tree.View),
            this.factory.namedNode(identifier.path)
        ));

        this.addMeta(quads, metadata.mine);

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
