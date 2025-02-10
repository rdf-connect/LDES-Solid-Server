import { type SDSMetadata, View } from "./View";
import { getLoggerFor, RedirectHttpError } from "@solid/community-server";
import {
    CacheDirectives,
    LDES,
    RDF,
    RelationType,
    SDS,
    TREE,
} from "@treecg/types";
import { Parser } from "n3";
import { DataFactory } from "rdf-data-factory";
import { RdfStore } from "rdf-stores";
import { Fragment, parseRdfThing, RelationParameters } from "./Fragment";
import { Repository } from "../repositories/Repository";
import { DCAT } from "../util/Vocabulary";
import { Parsed, parseIndex, reconstructIndex } from "../util/utils";
import { SDSFragment } from "./SDSFragment";

const df = new DataFactory();

export class SDSView implements View {
    repository: Repository;
    roots!: string[];
    descriptionId: string;

    streamId: string;
    freshDuration: number = 60;
    protected readonly logger = getLoggerFor(this);

    constructor(repository: Repository, streamId: string, descriptionId: string) {
        this.repository = repository;
        this.streamId = streamId;
        this.descriptionId = descriptionId;
        this.roots = [];
    }

    async init(
        base: string,
        prefix: string,
        freshDuration: number,
    ): Promise<void> {
        this.freshDuration = freshDuration;
        await this.repository.open();

        const roots = await this.repository.findRoots(this.streamId);
        if (roots.length > 0) {
            for (const root of roots) {
                this.roots.push(
                    [
                        base.replace(/^\/|\/$/g, ""),
                        prefix.replace(/^\/|\/$/g, ""),
                        root,
                    ].join("/"),
                );
            }
        } else {
            this.roots = [
                [
                    base.replace(/^\/|\/$/g, ""),
                    prefix.replace(/^\/|\/$/g, ""),
                ].join("/"),
            ];
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

    getRoots(): string[] {
        return this.roots;
    }

    async getMetadata(ldes: string): Promise<SDSMetadata> {
        const metadataStore = RdfStore.createDefault();

        const viewDescription = this.descriptionId
            ? df.namedNode(this.descriptionId)
            : df.blankNode();

        for (const root of this.getRoots()) {
            metadataStore.addQuad(
                df.quad(
                    viewDescription,
                    RDF.terms.type,
                    TREE.terms.custom("ViewDescription"),
                )
            );
            metadataStore.addQuad(df.quad(viewDescription, DCAT.terms.endpointURL, df.namedNode(root)));
            metadataStore.addQuad(df.quad(viewDescription, DCAT.terms.servesDataset, df.namedNode(ldes)));
        }

        const streamMetadata = await this.repository.findMetadata(
            SDS.Stream,
            this.streamId,
        );
        if (streamMetadata) {
            new Parser().parse(streamMetadata).forEach((quad) => metadataStore.addQuad(quad));
            // Get sds:Dataset reference
            const dataset = metadataStore.getQuads(null, SDS.terms.dataset, null)[0];

            if (dataset) {
                // Extract shape, timestampPath and versionOfPath (if available)
                const shape = metadataStore.getQuads(dataset.object, TREE.terms.shape, null)[0];
                const timestampPath = metadataStore.getQuads(dataset.object, LDES.terms.timestampPath, null)[0];
                const versionOfPath = metadataStore.getQuads(dataset.object, LDES.terms.versionOfPath, null)[0];

                if (shape) {
                    metadataStore.addQuad(df.quad(df.namedNode(ldes), TREE.terms.shape, shape.object));
                }

                if (timestampPath) {
                    metadataStore.addQuad(df.quad(df.namedNode(ldes), LDES.terms.timestampPath, timestampPath.object));
                }

                if (versionOfPath) {
                    metadataStore.addQuad(df.quad(df.namedNode(ldes), LDES.terms.versionOfPath, versionOfPath.object));
                }
            }
        }

        return {
            quads: metadataStore.getQuads(),
            viewDescriptionNode: viewDescription,
        };
    }

    async getFragment(identifier: string): Promise<Fragment> {
        const { segs, query } = parseIndex(identifier);
        const members: string[] = [];
        const relations = <RelationParameters[]>[];

        const id = segs.length > 0 ? segs.join("/") : (await this.repository.findRoots(this.streamId))[0];

        this.logger.verbose(`Finding fragment for stream '${this.streamId}' and id '${id}'.`);
        const fragment = await this.repository.findBucket(this.streamId, id);

        if (fragment) {

            fragment.relations = fragment.relations || [];

            const rels: RelationParameters[] = fragment!.relations.map(
                ({ type, value, bucket, path }) => {
                    const index: Parsed = { segs: bucket.split("/"), query };
                    const relation: RelationParameters = {
                        type: <RelationType>type,
                        nodeId: reconstructIndex(index),
                    };

                    if (value) {
                        relation.value = parseRdfThing(value);
                    }
                    if (path) {
                        relation.path = parseRdfThing(path);
                    }

                    return relation;
                },
            );
            relations.push(...rels);
            members.push(...(fragment.members || []));
        } else {
            this.logger.error(`No such bucket found! (stream: '${this.streamId}', id: '${id}')`);
            throw new RedirectHttpError(404, "No fragment found", "");
        }

        return new SDSFragment(
            members,
            relations,
            this.repository,
            this.getCacheDirectives(fragment?.immutable),
            { created: fragment.created, updated: fragment.updated },
        );
    }
}
