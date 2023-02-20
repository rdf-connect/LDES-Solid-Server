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
    Representation,
    RepresentationMetadata,
    RepresentationPreferences,
    ResourceIdentifier,
    ResourceStore,
    trimLeadingSlashes
} from "@solid/community-server";
import * as RDF from "@rdfjs/types";
import {CacheDirectives, Member, RelationParameters, TREE} from "@treecg/types";
import {RDF as RDFT} from "@treecg/types/dist/lib/Vocabularies";
import {cacheToLiteral} from "./util/utils";
import {DataFactory, Quad_Object} from "n3";
import {PrefixView} from "./PrefixView";
import {HTTP} from "./util/Vocabulary";

const {namedNode, quad, blankNode, literal} = DataFactory;

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
    views: PrefixView[];

    initPromise: any;

    /**
     * @param id - The URI of the published LDES.
     * @param views - The mounted views that expose this LDES.
     * @param base - The base URI for the Solid Server.
     * @param relativePath - The relative path to the LDES.
     */
    constructor(id: string, views: PrefixView[], base: string, relativePath: string) {
        this.id = id;
        this.base = ensureTrailingSlash(base + trimLeadingSlashes(relativePath));
        this.views = views;

        this.initPromise = Promise.all(views.map(async view =>
            view.view.init(this.base, view.prefix)
        ));
        this.logger.info(`The LDES descriptions can be found at ${this.base}`);
        console.log(`The LDES descriptions can be found at ${this.base}`);
        this.logger.info(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
        console.log(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
    }

    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions): Promise<Representation> => {
        this.logger.info("Get representation");
        await this.initPromise;

        if (ensureTrailingSlash(identifier.path) === this.base) {
            // We got a base request, let's announce all mounted view
            const quads = await this.getViewDescriptions();

            return new BasicRepresentation(
                guardedStreamFrom(quads),
                new RepresentationMetadata(this.getMetadata({pub: true, immutable: true}))
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
        let bucketIdentifier = identifier.path.substring(idStart);

        const fragment = await view.view.getFragment(bucketIdentifier);
        const quads: Array<RDF.Quad> = [];

        if (view.view.getRoot() === identifier.path) {
            quads.push(...await view.view.getMetadata(this.id));
            quads.push(quad(
                namedNode(this.id),
                TREE.terms.view,
                namedNode(identifier.path)
            ));
        }
        quads.push(quad(
            namedNode(identifier.path),
            RDFT.terms.type,
            TREE.terms.custom("Node")
        ));

        const relations = await fragment.getRelations();
        const members = await fragment.getMembers();

        relations.forEach(relation => this.addRelations(quads, identifier.path, baseIdentifier, relation));
        members.forEach(m => this.addMember(quads, m));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
            new RepresentationMetadata(this.getMetadata(await fragment.getCacheDirectives()))
        );
    }

    private async getViewDescriptions(): Promise<RDF.Quad[]> {
        const quads = [];

        for (let view of this.views) {
            quads.push(...await view.view.getMetadata(this.id));
            const mRoot = view.view.getRoot();
            if (mRoot) {
                quads.push(quad(
                    namedNode(this.id),
                    TREE.terms.view,
                    namedNode(mRoot)
                ));
            }
        }
        return quads;
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return {[CONTENT_TYPE]: INTERNAL_QUADS};

        const cacheLit = cacheToLiteral(cache);
        return {[HTTP.cache_control]: literal(cacheLit), [CONTENT_TYPE]: INTERNAL_QUADS};
    }

    private addRelations(quads: Array<RDF.Quad>, identifier: string, baseIdentifier: string, relation: RelationParameters) {
        const bn = blankNode();
        quads.push(quad(
            namedNode(identifier),
            TREE.terms.relation,
            bn
        ));

        quads.push(quad(
            bn,
            RDFT.terms.type,
            namedNode(relation.type)
        ))

        quads.push(quad(
            bn,
            TREE.terms.node,
            namedNode(baseIdentifier + relation.nodeId)
        ))

        if (relation.path)
            quads.push(quad(
                bn,
                TREE.terms.path,
                <RDF.Quad_Object>relation.path
            ))

        if (relation.value)
            relation.value.forEach(value =>
                quads.push(quad(
                    bn,
                    TREE.terms.value,
                    <RDF.Quad_Object>value
                ))
            )
    }

    private addMember(quads: Array<RDF.Quad>, member: Member) {
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
