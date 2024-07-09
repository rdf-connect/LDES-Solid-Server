import {
    BasicRepresentation,
    ChangeMap,
    Conditions,
    CONTENT_TYPE,
    ensureTrailingSlash,
    getLoggerFor,
    guardedStreamFrom,
    INTERNAL_QUADS,
    MetadataRecord,
    NotFoundHttpError,
    Patch,
    RedirectHttpError,
    Representation,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore,
    trimLeadingSlashes
} from "@solid/community-server";
import { Quad, Quad_Object } from "@rdfjs/types";
import { CacheDirectives, Member, RelationParameters, TREE, LDES, RDF, VOID } from "@treecg/types";
import { cacheToLiteral, getShapeQuads } from "./util/utils";
import { DataFactory } from "n3";
import { PrefixView } from "./PrefixView";
import { HTTP } from "./util/Vocabulary";
import path from "node:path/posix";

const { namedNode, quad, blankNode, literal } = DataFactory;

/**
 * ResourceStore which uses {@link PrefixView} for backend access.
 *
 * The LDESStore provides read operations for the resources which are retrieved using the view of the PrefixView.
 *
 * There are two types of requests that can be executed:
 *  * Base request: A request to read all views stored in all databases,
 *  * Fragment request: A request to a fragment within a specific view.
 *
 */
export class LDESStore implements ResourceStore {
    protected readonly logger = getLoggerFor(this);
    id: string;
    base: string;
    shape?: string;
    views: PrefixView[];
    freshDuration: number;

    initPromise: any;

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
        this.base = ensureTrailingSlash(base + trimLeadingSlashes(relativePath));
        this.id = id || this.base;
        this.views = views;
        this.shape = shape;
        this.freshDuration = freshDuration;

        this.initPromise = Promise.all(views.map(async view => {
            view.view.init(this.base, view.prefix, this.freshDuration)
        }));
        this.logger.info(`The LDES descriptions can be found at ${this.base}`);
        console.log(`The LDES descriptions can be found at ${this.base}`);
        this.logger.info(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
        console.log(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
    }

    getRepresentation = async (
        identifier: ResourceIdentifier,
        preferences: RepresentationPreferences,
        conditions?: Conditions
    ): Promise<Representation> => {
        console.log("Get representation: ", identifier);
        await this.initPromise;

        if (ensureTrailingSlash(identifier.path) === this.base) {
            // We got a base request, let's announce all mounted view
            const quads = await this.getViewDescriptions();
            quads.push(quad(
                namedNode(this.id),
                RDF.terms.type,
                LDES.terms.EventStream,
            ));
            if (this.shape) {
                quads.push(...(await getShapeQuads(this.id, this.shape)));
            }

            return new BasicRepresentation(
                guardedStreamFrom(quads),
                new RepresentationMetadata(this.getMetadata({
                    pub: true,
                    immutable: false,
                    maxAge: this.freshDuration
                }))
            );
        }

        const view = this.views.find((pv) => identifier.path.indexOf(pv.prefix) >= 0);
        if (!view) {
            this.logger.info("No LDES view found for identifier " + identifier.path);
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
                throw new RedirectHttpError(ex.statusCode, ex.name, path.posix.join(baseIdentifier, ex.location).replace(':/', '://'));
            } else {
                throw ex;
            }
        }

        const quads: Array<Quad> = [];
        quads.push(quad(
            namedNode(this.id),
            RDF.terms.type,
            LDES.terms.EventStream,
        ));

        if (this.shape) {
            quads.push(...(await getShapeQuads(this.id, this.shape)));
        }

        const [viewDescriptionQuads, viewDescriptionId] = await view.view.getMetadata(this.id);
        quads.push(...viewDescriptionQuads);
        const mRoots = view.view.getRoots();
        if (mRoots) {
            for (const mRoot of mRoots) {
                quads.push(quad(
                    namedNode(this.id),
                    TREE.terms.view,
                    namedNode(mRoot),
                ));
            }
        }

        // TODO: Check if this can be handled by the CSS instead
        const normalizedIDPath = decodeURIComponent(identifier.path);

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
        );

        if (view.view.getRoots().includes(normalizedIDPath)) {
            quads.push(quad(
                namedNode(this.id),
                TREE.terms.view,
                namedNode(normalizedIDPath)
            ));
        } else {
            // This is not the case, you can access a subset of all members
            quads.push(quad(
                namedNode(this.id),
                VOID.terms.subset,
                namedNode(normalizedIDPath),
            ));
        }

        const relations = await fragment.getRelations();
        const members = await fragment.getMembers();

        relations.forEach(relation => this.addRelations(quads, normalizedIDPath, baseIdentifier, relation));
        members.forEach(m => this.addMember(quads, m));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
            new RepresentationMetadata(this.getMetadata(await fragment.getCacheDirectives()))
        );
    }

    private async getViewDescriptions(): Promise<Quad[]> {
        const quads = [];

        for (let view of this.views) {
            const [metaQuads, id] = await view.view.getMetadata(this.id);
            quads.push(...metaQuads);
            const mRoots = view.view.getRoots();
            if (mRoots.length > 0) {
                for (const mRoot of mRoots) {
                    quads.push(quad(
                        namedNode(mRoot),
                        TREE.terms.custom("viewDescription"),
                        id
                    ));
                    quads.push(quad(
                        namedNode(this.id),
                        TREE.terms.view,
                        namedNode(mRoot)
                    ));
                }
            }
        }
        return quads;
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return { [CONTENT_TYPE]: INTERNAL_QUADS };

        const cacheLit = cacheToLiteral(cache);
        return { [HTTP.cache_control]: literal(cacheLit), [CONTENT_TYPE]: INTERNAL_QUADS };
    }

    private addRelations(quads: Array<Quad>, identifier: string, baseIdentifier: string, relation: RelationParameters) {
        const bn = blankNode();
        quads.push(quad(
            namedNode(identifier),
            TREE.terms.relation,
            bn
        ));

        quads.push(quad(
            bn,
            RDF.terms.type,
            namedNode(relation.type)
        ))

        quads.push(quad(
            bn,
            TREE.terms.node,
            namedNode(path.posix.join(baseIdentifier, relation.nodeId).replace(':/', '://'))
        ))

        if (relation.path)
            quads.push(quad(
                bn,
                TREE.terms.path,
                <Quad_Object>relation.path
            ))

        if (relation.value)
            relation.value.forEach(value =>
                quads.push(quad(
                    bn,
                    TREE.terms.value,
                    <Quad_Object>value
                ))
            )
    }

    private addMember(quads: Array<Quad>, member: Member) {
        quads.push(quad(
            namedNode(this.id),
            TREE.terms.member,
            <Quad_Object>member.id
        ));
        quads.push(...member.quads);
    }

    setRepresentation = async (identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ChangeMap> => {
        console.log("Set representation", identifier, representation, conditions)
        throw "Not implemented set"
    }

    addResource = async (container: ResourceIdentifier, representation: Representation, conditions?: Conditions): Promise<ChangeMap> => {
        console.log("Add representation", container, representation, conditions)
        throw "Not implemented add"
    }

    deleteResource = async (identifier: ResourceIdentifier, conditions?: Conditions): Promise<ChangeMap> => {
        console.log("Delete representation", identifier, conditions)
        throw "Not implemented delete"
    }

    modifyResource = async (identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions): Promise<ChangeMap> => {
        console.log("Modify representation", identifier, patch, conditions)
        throw "Not implemented modify"
    }

    hasResource = async (_id: ResourceIdentifier, _conditions?: Conditions | undefined): Promise<boolean> => {
        return false;
    }
}
