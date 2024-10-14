import { View } from "./View";
import { getLoggerFor, RedirectHttpError } from "@solid/community-server";
import { DBConfig } from "../DBConfig";
import type { Quad, Quad_Object } from "@rdfjs/types";
import { CacheDirectives, LDES, RDF, RelationType, SDS, TREE } from "@treecg/types";
import { DataFactory, Parser } from "n3";
import { Fragment, parseRdfThing, RelationParameters } from "./Fragment";
import { getRepository, Repository } from "../repositories/Repository";
import { DCAT } from "../util/Vocabulary";
import { Parsed, parseIndex, reconstructIndex } from "../util/utils";
import { SDSFragment } from "./SDSFragment";

const { quad, namedNode, blankNode } = DataFactory;

export class SDSView implements View {
    dbConfig: DBConfig;
    repository: Repository;
    roots!: string[];
    descriptionId: string;

    streamId: string;
    freshDuration: number = 60;
    protected readonly logger = getLoggerFor(this);

    constructor(db: DBConfig, streamId: string, descriptionId: string) {
        this.dbConfig = db;
        this.repository = getRepository(this.dbConfig);
        this.streamId = streamId;
        this.descriptionId = descriptionId;
        this.roots = [];
    }

    async init(base: string, prefix: string, freshDuration: number): Promise<void> {
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

    async getMetadata(ldes: string): Promise<[Quad[], Quad_Object]> {
        const quads = [];
        const blankId = this.descriptionId
            ? namedNode(this.descriptionId)
            : blankNode();
        for (const root of this.getRoots()) {
            quads.push(
                quad(
                    blankId,
                    RDF.terms.type,
                    TREE.terms.custom("ViewDescription"),
                ),
                quad(blankId, DCAT.terms.endpointURL, namedNode(root)),
                quad(blankId, DCAT.terms.servesDataset, namedNode(ldes)),
            );
        }

        const stream = await this.repository.findMetadata(SDS.Stream, this.streamId);
        if (stream) {
            quads.push(
                quad(
                    blankId,
                    LDES.terms.custom("managedBy"),
                    namedNode(this.streamId),
                ),
            );

            quads.push(...new Parser().parse(stream));
        }

        return [quads, blankId];
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
        );
    }
}
