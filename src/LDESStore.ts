import {
    BasicRepresentation,
    ChangeMap,
    Conditions,
    CONTENT_TYPE,
    ensureTrailingSlash,
    getLoggerFor,
    guardedStreamFrom,
    IdentifierMap,
    INTERNAL_QUADS,
    LDP,
    MetadataRecord,
    NotFoundHttpError,
    Patch,
    RedirectHttpError,
    Representation,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore,
    SOLID_META,
    trimLeadingSlashes,
    updateModifiedDate,
} from "@solid/community-server";
import { Quad, Quad_Object, Quad_Subject } from "@rdfjs/types";
import { CacheDirectives, DC, LDES, RDF, TREE, VOID, XSD } from "@treecg/types";
import { cacheToLiteral, getShapeQuads } from "./util/utils";
import { DataFactory } from "n3";
import { PrefixView } from "./PrefixView";
import { HTTP } from "./util/Vocabulary";
import * as path from "path";
import { RelationParameters } from "./ldes/Fragment";
import { Stream } from "stream";
import { Member } from "./repositories/Repository";

const { namedNode, quad, blankNode, literal } = DataFactory;

/**
 * ResourceStore which uses {@link PrefixView} for backend access.
 *
 * The LDESStore provides read operations for the resources which are retrieved using the view of the PrefixView.
 *
 * There are two types of requests that can be executed:
 *  * Base request: A request to read all views stored in all databases,
 *  * Fragment request: A request to a fragment within a specific view.
 */
export class LDESStore implements ResourceStore {
    id: string;
    base: string;
    shape?: string;
    views: PrefixView[];
    freshDuration: number;
    initPromise: unknown;
    protected readonly logger = getLoggerFor(this);

    /**
     * @param id - The URI of the published LDES.
     * @param views - The mounted views that expose this LDES.
     * @param base - The base URI for the Solid Server.
     * @param relativePath - The relative path to the LDES.
     * @param freshDuration - The number of seconds that a resource is guaranteed to be fresh.
     * @param shape - SHACL shape describing members of this LDES
     */
    constructor(
        views: PrefixView[],
        base: string,
        relativePath: string,
        freshDuration: number = 60,
        id?: string,
        shape?: string,
    ) {
        this.base = ensureTrailingSlash(
            base + trimLeadingSlashes(relativePath),
        );
        this.id = id || this.base;
        this.views = views;
        this.shape = shape;
        this.freshDuration = freshDuration;

        this.initPromise = Promise.all(
            views.map(async (view) => {
                await view.view.init(this.base, view.prefix, this.freshDuration);
            }),
        );
        this.logger.info(`The LDES descriptions can be found at ${this.base}`);
        this.logger.info(
            `Mounting ${this.views.length} LDES views ${this.views
                .map((x) => x.prefix)
                .join(", ")}`,
        );
    }

    getRepresentation = async (
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions,
    ): Promise<Representation> => {
        this.logger.info("Getting representation for " + identifier.path);
        await this.initPromise;

        if (ensureTrailingSlash(identifier.path) === this.base) {
            const md = new RepresentationMetadata(
                namedNode(identifier.path),
                this.getMetadata({
                    pub: true,
                    immutable: false,
                    maxAge: this.freshDuration,
                }),
            );
            this.addContainerTypes(md);
            // We got a base request, let's announce all mounted view
            const quads = await this.getViewDescriptions(md, identifier.path);
            md.add(
                RDF.terms.type,
                LDP.terms.Container,
                SOLID_META.terms.ResponseMetadata,
            );
            quads.push(
                quad(
                    namedNode(this.id),
                    RDF.terms.type,
                    LDES.terms.EventStream,
                ),
            );
            if (this.shape) {
                quads.push(...(await getShapeQuads(this.id, this.shape)));
            }

            return new BasicRepresentation(guardedStreamFrom(quads), md);
        }

        const view = this.views.find(
            (pv) => identifier.path.indexOf(pv.prefix) >= 0,
        );
        if (!view) {
            this.logger.info(
                "No LDES view found for identifier " + identifier.path,
            );
            throw new NotFoundHttpError("No LDES found!");
        }

        let idStart = identifier.path.indexOf(view.prefix) + view.prefix.length;
        // pesky trailing slashes
        if (identifier.path.charAt(idStart) == "/") {
            idStart += 1;
        }
        const baseIdentifier = identifier.path.substring(0, idStart);
        const bucketIdentifier = identifier.path.substring(idStart);

        let fragment;
        try {
            fragment = await view.view.getFragment(bucketIdentifier);
        } catch (ex) {
            if (RedirectHttpError.isInstance(ex)) {
                throw new RedirectHttpError(
                    ex.statusCode,
                    ex.name,
                    path.posix
                        .join(baseIdentifier, ex.location)
                        .replace(":/", "://"),
                );
            } else {
                throw ex;
            }
        }

        const md = new RepresentationMetadata(
            namedNode(identifier.path),
            this.getMetadata(await fragment.getCacheDirectives()),
        );
        this.addContainerTypes(md);
        const timestamps = await fragment.getTimestamps();
        updateModifiedDate(md, new Date(timestamps.updated));

        const quads: Array<Quad> = [];
        quads.push(
            quad(namedNode(this.id), RDF.terms.type, LDES.terms.EventStream),
        );

        if (this.shape) {
            quads.push(...(await getShapeQuads(this.id, this.shape)));
        }

        const [viewDescriptionQuads, viewDescriptionId] =
            await view.view.getMetadata(this.id);
        quads.push(...viewDescriptionQuads);
        const mRoots = view.view.getRoots();
        if (mRoots) {
            for (const mRoot of mRoots) {
                quads.push(
                    quad(namedNode(this.id), TREE.terms.view, namedNode(mRoot)),
                );
            }
        }

        // Note: this was before: const normalizedIDPath = decodeURIComponent(identifier.path);
        const normalizedIDPath = identifier.path;

        quads.push(
            quad(
                namedNode(normalizedIDPath),
                RDF.terms.type,
                TREE.terms.custom("Node"),
            ),
            quad(
                namedNode(normalizedIDPath),
                TREE.terms.custom("viewDescription"),
                viewDescriptionId,
            ),
            quad(
                namedNode(normalizedIDPath),
                namedNode("http://purl.org/dc/terms/created"),
                literal(new Date(timestamps.created).toISOString(), namedNode(XSD.dateTime)),
            ),
            quad(
                namedNode(normalizedIDPath),
                namedNode("http://purl.org/dc/terms/modified"),
                literal(new Date(timestamps.updated).toISOString(), namedNode(XSD.dateTime)),
            ),
        );

        if (view.view.getRoots().includes(normalizedIDPath)) {
            quads.push(
                quad(
                    namedNode(this.id),
                    TREE.terms.view,
                    namedNode(normalizedIDPath),
                ),
            );
        } else {
            // This is not the case, you can access a subset of all members
            quads.push(
                quad(
                    namedNode(this.id),
                    VOID.terms.subset,
                    namedNode(normalizedIDPath),
                ),
            );
        }

        const relations = await fragment.getRelations();
        const members = await fragment.getMembers();

        quads.push(
            quad(
                namedNode(normalizedIDPath),
                RDF.terms.type,
                LDP.terms.Container,
            ),
        );

        relations.forEach((relation) =>
            this.addRelations(
                quads,
                normalizedIDPath,
                baseIdentifier,
                relation,
            ),
        );

        // Get Accept Content-Types with weight 1 and check if it includes the `metadata+` request.
        const includeMetadata = Object.entries(preferences.type || {}).filter(([key, value]) => (preferences.type || {})[key] === 1).some(([key, value]) => key.includes("/metadata+"));

        members.forEach((m) => this.addMember(quads, m, includeMetadata));
        return new BasicRepresentation(guardedStreamFrom(quads), md);
    };

    setRepresentation = async (
        identifier: ResourceIdentifier,
        representation: Representation,
        conditions?: Conditions,
    ): Promise<ChangeMap> => {
        console.log(
            "Set representation",
            identifier,
            representation,
            conditions,
        );
        throw "Not implemented set";
    };

    addResource = async (
        container: ResourceIdentifier,
        representation: Representation,
        conditions?: Conditions,
    ): Promise<ChangeMap> => {
        const streamToString = (stream: Stream) => {
            const chunks: Buffer[] = [];
            return new Promise<string>((resolve, reject) => {
                stream.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
                stream.on("error", (err) => reject(err));
                stream.on("end", () =>
                    resolve(Buffer.concat(chunks).toString("utf8")),
                );
            });
        };

        const data = await streamToString(representation.data);
        this.logger.info(
            `Add representation ${container} ${representation} ${conditions}`,
        );
        this.logger.debug(data);

        return new IdentifierMap();
    };

    deleteResource = async (
        identifier: ResourceIdentifier,
        conditions?: Conditions,
    ): Promise<ChangeMap> => {
        this.logger.info(`Delete representation ${identifier} ${conditions}`);
        throw "Not implemented delete";
    };

    modifyResource = async (
        identifier: ResourceIdentifier,
        patch: Patch,
        conditions?: Conditions,
    ): Promise<ChangeMap> => {
        this.logger.info(
            `Modify representation ${identifier} ${patch} ${conditions}`,
        );
        throw "Not implemented modify";
    };

    hasResource = async (
        id: ResourceIdentifier,
        conditions?: Conditions | undefined,
    ): Promise<boolean> => {
        this.logger.info(`Has resource ${id} ${conditions}`);
        return true;
    };

    private addContainerTypes(md: RepresentationMetadata) {
        for (const ty of [
            LDP.terms.Container,
            LDP.terms.Resource,
            LDP.terms.BasicContainer,
        ]) {
            md.add(RDF.terms.type, ty, SOLID_META.terms.ResponseMetadata);
        }
    }

    private async getViewDescriptions(
        md: RepresentationMetadata,
        url: string,
    ): Promise<Quad[]> {
        const quads = [];

        for (const view of this.views) {
            const [metaQuads, id] = await view.view.getMetadata(this.id);
            quads.push(...metaQuads);
            const mRoots = view.view.getRoots();
            if (mRoots.length > 0) {
                for (const mRoot of mRoots) {
                    quads.push(
                        quad(
                            namedNode(mRoot),
                            TREE.terms.custom("viewDescription"),
                            id,
                        ),
                    );
                    quads.push(
                        quad(
                            namedNode(this.id),
                            TREE.terms.view,
                            namedNode(mRoot),
                        ),
                    );

                    quads.push(
                        quad(
                            namedNode(url),
                            LDP.terms.contains,
                            namedNode(mRoot),
                        ),
                    );

                    md.add(
                        LDP.terms.contains,
                        namedNode(mRoot),
                        SOLID_META.terms.ResponseMetadata,
                    );

                    for (const ty of [
                        LDP.terms.Container,
                        LDP.terms.Resource,
                        LDP.terms.BasicContainer,
                    ]) {
                        quads.push(quad(namedNode(mRoot), RDF.terms.type, ty));
                    }
                }
            }
        }
        return quads;
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return { [CONTENT_TYPE]: INTERNAL_QUADS };

        const cacheLit = cacheToLiteral(cache);
        return {
            [HTTP.cache_control]: literal(cacheLit),
            [CONTENT_TYPE]: INTERNAL_QUADS,
        };
    }

    private addRelations(
        quads: Array<Quad>,
        identifier: string,
        baseIdentifier: string,
        relation: RelationParameters,
    ) {
        const bn = blankNode();
        quads.push(quad(namedNode(identifier), TREE.terms.relation, bn));

        quads.push(quad(bn, RDF.terms.type, namedNode(relation.type)));

        const relationTarget = namedNode(
            path.posix
                .join(baseIdentifier, relation.nodeId)
                .replace(":/", "://"),
        );
        quads.push(quad(bn, TREE.terms.node, relationTarget));
        quads.push(
            quad(namedNode(identifier), LDP.terms.contains, relationTarget),
        );

        if (relation.path) {
            quads.push(
                quad(bn, TREE.terms.path, <Quad_Object>relation.path.id),
                ...relation.path.quads,
            );
        }

        if (relation.value) {
            quads.push(
                quad(bn, TREE.terms.value, <Quad_Object>relation.value.id),
                ...relation.value.quads,
            );
        }

        for (const ty of [
            LDP.terms.Container,
            LDP.terms.Resource,
            LDP.terms.BasicContainer,
        ]) {
            quads.push(quad(relationTarget, RDF.terms.type, ty));
        }
    }

    private addMember(quads: Array<Quad>, member: Member, includeMetadata: boolean) {
        quads.push(
            quad(namedNode(this.id), TREE.terms.member, <Quad_Object>member.id),
        );
        if (includeMetadata) {
            quads.push(quad(<Quad_Subject>member.id, DC.terms.custom("created"), literal(new Date(member.created).toISOString(), namedNode(XSD.dateTime)), namedNode(LDES.custom("IngestionMetadata"))));
        }
        quads.push(...member.quads);
    }
}
