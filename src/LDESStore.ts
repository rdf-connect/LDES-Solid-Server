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
import { cacheToLiteral } from "./util/utils";
import { DataFactory } from "rdf-data-factory";
import { PrefixView } from "./PrefixView";
import { HTTP } from "./util/Vocabulary";
import * as path from "path";
import { RelationParameters } from "./ldes/Fragment";
import { Stream } from "stream";
import { Member } from "./repositories/Repository";

const df = new DataFactory();

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
        id?: string
    ) {
        this.base = ensureTrailingSlash(
            base + trimLeadingSlashes(relativePath),
        );
        this.id = id || this.base;
        this.views = views;
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
            // We got a base request, let's announce all mounted views
            const md = new RepresentationMetadata(
                df.namedNode(identifier.path),
                this.getMetadata({
                    pub: true,
                    immutable: false,
                    maxAge: this.freshDuration,
                }),
            );
            this.addContainerTypes(md);
            const quads = await this.getViewDescriptions(md, identifier.path);
            md.add(
                RDF.terms.type,
                LDP.terms.Container,
                SOLID_META.terms.ResponseMetadata,
            );
            quads.push(
                df.quad(
                    df.namedNode(this.id),
                    RDF.terms.type,
                    LDES.terms.EventStream,
                ),
            );

            return new BasicRepresentation(guardedStreamFrom(quads), md);
        }

        const fragmentIRI = identifier.path;

        // Get a reference to the requested view
        const view = this.views.find(
            (pv) => fragmentIRI.indexOf(pv.prefix) >= 0,
        );
        if (!view) {
            this.logger.info(
                "No LDES view found for identifier " + fragmentIRI,
            );
            throw new NotFoundHttpError("No LDES found!");
        }

        // Deal with pesky trailing slashes
        let idStart = fragmentIRI.indexOf(view.prefix) + view.prefix.length;
        if (fragmentIRI.charAt(idStart) == "/") {
            idStart += 1;
        }
        // Split the request URL into the base identifier and the bucket identifier
        const baseIdentifier = fragmentIRI.substring(0, idStart);
        const bucketIdentifier = fragmentIRI.substring(idStart);

        let fragment;
        try {
            // Get the requested fragment
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

        // Add fragment's cache directives to response metadata
        const md = new RepresentationMetadata(
            df.namedNode(fragmentIRI),
            this.getMetadata(await fragment.getCacheDirectives()),
        );
        // Add LDP/Solid types  
        this.addContainerTypes(md);
        // Update fragment's last modified date (if necessary)
        const timestamps = await fragment.getTimestamps();
        updateModifiedDate(md, new Date(timestamps.updated));

        // Quad array that will contain all the fragemnt's data
        const quads: Array<Quad> = [];
        quads.push(
            df.quad(df.namedNode(this.id), RDF.terms.type, LDES.terms.EventStream),
        );

        // Get LDES metadata quads from SDS metadata
        const sdsMetadata = await view.view.getMetadata(this.id);
        quads.push(...sdsMetadata.quads);

        // Add all view references to the LDES
        const mRoots = view.view.getRoots();
        if (mRoots) {
            for (const mRoot of mRoots) {
                quads.push(
                    df.quad(df.namedNode(this.id), TREE.terms.view, df.namedNode(mRoot)),
                );
            }
        }

        // Add the fragment's TREE metadata
        quads.push(
            df.quad(
                df.namedNode(fragmentIRI),
                RDF.terms.type,
                TREE.terms.custom("Node"),
            ),
            df.quad(
                df.namedNode(fragmentIRI),
                TREE.terms.custom("viewDescription"),
                sdsMetadata.viewDescriptionNode,
            ),
            df.quad(
                df.namedNode(fragmentIRI),
                df.namedNode("http://purl.org/dc/terms/created"),
                df.literal(new Date(timestamps.created).toISOString(), df.namedNode(XSD.dateTime)),
            ),
            df.quad(
                df.namedNode(fragmentIRI),
                df.namedNode("http://purl.org/dc/terms/modified"),
                df.literal(new Date(timestamps.updated).toISOString(), df.namedNode(XSD.dateTime)),
            ),
        );
        // Add the fragment's LDP metadata
        quads.push(
            df.quad(
                df.namedNode(fragmentIRI),
                RDF.terms.type,
                LDP.terms.Container,
            ),
        );

        if (!view.view.getRoots().includes(fragmentIRI)) {
             // This is fragment is not a view, so you can access only a subset of all members
            quads.push(
                df.quad(
                    df.namedNode(this.id),
                    VOID.terms.subset,
                    df.namedNode(fragmentIRI),
                ),
            );
        }

        // Append relations and members from data store
        const [relations, members] = await Promise.all([
            fragment.getRelations(),
            fragment.getMembers(),
        ]);

        relations.forEach((relation) =>
            this.addRelations(
                quads,
                fragmentIRI,
                baseIdentifier,
                relation,
            ),
        );

        // Get Accept Content-Types with weight 1 and check if it includes the `metadata+` request.
        // If true, this includes ingestion metadata for every member. 
        const includeMetadata = Object.entries(preferences.type || {})
            .filter(([key, value]) => (preferences.type || {})[key] === 1)
            .some(([key, value]) => key.includes("/metadata+"));

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
            const sdsMetadata = await view.view.getMetadata(this.id);
            quads.push(...sdsMetadata.quads);
            const mRoots = view.view.getRoots();
            if (mRoots.length > 0) {
                for (const mRoot of mRoots) {
                    quads.push(
                        df.quad(
                            df.namedNode(mRoot),
                            TREE.terms.custom("viewDescription"),
                            sdsMetadata.viewDescriptionNode,
                        ),
                    );
                    quads.push(
                        df.quad(
                            df.namedNode(this.id),
                            TREE.terms.view,
                            df.namedNode(mRoot),
                        ),
                    );

                    quads.push(
                        df.quad(
                            df.namedNode(url),
                            LDP.terms.contains,
                            df.namedNode(mRoot),
                        ),
                    );

                    md.add(
                        LDP.terms.contains,
                        df.namedNode(mRoot),
                        SOLID_META.terms.ResponseMetadata,
                    );

                    for (const ty of [
                        LDP.terms.Container,
                        LDP.terms.Resource,
                        LDP.terms.BasicContainer,
                    ]) {
                        quads.push(df.quad(df.namedNode(mRoot), RDF.terms.type, ty));
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
            [HTTP.cache_control]: df.literal(cacheLit),
            [CONTENT_TYPE]: INTERNAL_QUADS,
        };
    }

    private addRelations(
        quads: Array<Quad>,
        identifier: string,
        baseIdentifier: string,
        relation: RelationParameters,
    ) {
        const bn = df.blankNode();
        quads.push(df.quad(df.namedNode(identifier), TREE.terms.relation, bn));

        quads.push(df.quad(bn, RDF.terms.type, df.namedNode(relation.type)));

        const relationTarget = df.namedNode(
            path.posix
                .join(baseIdentifier, relation.nodeId)
                .replace(":/", "://"),
        );
        quads.push(df.quad(bn, TREE.terms.node, relationTarget));
        quads.push(
            df.quad(df.namedNode(identifier), LDP.terms.contains, relationTarget),
        );

        if (relation.path) {
            quads.push(
                df.quad(bn, TREE.terms.path, <Quad_Object>relation.path.id),
                ...relation.path.quads,
            );
        }

        if (relation.value) {
            quads.push(
                df.quad(bn, TREE.terms.value, <Quad_Object>relation.value.id),
                ...relation.value.quads,
            );
        }

        for (const ty of [
            LDP.terms.Container,
            LDP.terms.Resource,
            LDP.terms.BasicContainer,
        ]) {
            quads.push(df.quad(relationTarget, RDF.terms.type, ty));
        }
    }

    private addMember(quads: Array<Quad>, member: Member, includeMetadata: boolean) {
        quads.push(
            df.quad(df.namedNode(this.id), TREE.terms.member, <Quad_Object>member.id),
        );
        if (includeMetadata) {
            quads.push(
                df.quad(
                    <Quad_Subject>member.id, 
                    DC.terms.custom("created"), 
                    df.literal(new Date(member.created).toISOString(), df.namedNode(XSD.dateTime)), 
                    df.namedNode(LDES.custom("IngestionMetadata"))
                )
            );
        }
        quads.push(...member.quads);
    }
}
