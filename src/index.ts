import type * as RDF from '@rdfjs/types';
import { BasicRepresentation, ChangeMap, Conditions, CONTENT_TYPE, createUriAndTermNamespace, getLoggerFor, guardedStreamFrom, INTERNAL_QUADS, MetadataRecord, Patch, Representation, RepresentationMetadata, RepresentationPreferences, ResourceIdentifier, ResourceStore } from '@solid/community-server';
import { CacheDirectives, Member, RelationParameters } from '@treecg/types';
import { DataFactory, Quad_Object } from 'n3';
import { RDF as RDFT, TREE } from '@treecg/types';
import { cacheToLiteral } from './utils';

export const HTTP = createUriAndTermNamespace('urn:npm:solid:community-server:http:',
    'cache_control',
);

export * from './mongo';

// export * from './Fetcher';
// export * from './LDESStore';

const { namedNode, quad, blankNode, literal } = DataFactory;

/**
 * Interface representing a single Fragment.
 * A fragment contains zero or more members, zero or more relations and can be a view (all members are reachable from the current fragment)
 */
export interface Fragment {
    /**
     * Fetch or return members from this fragment
     */
    getMembers(): Promise<Member[]>;
    /**
     * Fetch or return all relations starting from this fragment
     */
    getRelations(): Promise<RelationParameters[]>;
    /**
     * Fetch or return the cache directives concerning this fragment
     */
    getCacheDirectives(): Promise<CacheDirectives>;
    /**
     * Boolean indicating whether or not all members can be reached from this fragment (ldes:view)
     */
    isView(): boolean;
}


/**
 * Interface representing a LDES view. All mounted view should serve the same dataset.
 */
export interface View {
    /**
     * Initialize function is called when mounting this view (before any other invocation).
     */
    init(): Promise<boolean>;
    /**
     * Function requesting the metadata of this view, this metadata should contain all required information for query agents.
     */
    getMetadata(): Promise<RDF.Quad[]>;
    /**
     * Function requesting a single {@link Fragment}. 
     *
     * @param identifier - identifier for this fragment (without the hostname and without the view prefix)
     */
    getFragment(identifier: string): Promise<Fragment>;
}

export class PrefixView {
    prefix: string;
    view: View;
    constructor(prefix: string, view: View) {
        this.prefix = prefix;
        this.view = view;
    }
}

export class LDESStore implements ResourceStore {
    protected readonly logger = getLoggerFor(this);

    id: string;
    views: PrefixView[];

    initPromise: any;

    constructor(id: string, views: PrefixView[]) {
        this.id = id;
        this.views = views;

        this.initPromise = Promise.all(views.map(view => view.view.init()));
        this.logger.info(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
        console.log(`Mounting ${this.views.length} LDES views ${this.views.map(x => x.prefix).join(", ")}`);
    }

    getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions): Promise<Representation> => {
        this.logger.info("Get representation");
        await this.initPromise;

        const view = this.views.find((pv) => identifier.path.indexOf(pv.prefix) >= 0);
        if (!view) {
            throw "No LDES found!"
        }

        let idStart = identifier.path.indexOf(view.prefix) + view.prefix.length;
        // pesky trailing slashes
        if (identifier.path.charAt(idStart) == "/") {
            idStart += 1;
        }
        const baseIdentifier = identifier.path.substring(0, idStart);
        let bucketIdentifier = identifier.path.substring(idStart);

        console.log(baseIdentifier, bucketIdentifier);

        const fragment = await view.view.getFragment(bucketIdentifier);
        const quads: Array<RDF.Quad> = [];

        if (fragment.isView()) {
            quads.push(quad(
                namedNode(this.id),
                TREE.terms.view,
                namedNode(identifier.path)
            ));
        }

        const relations = await fragment.getRelations();
        const members = await fragment.getMembers();

        relations.forEach(relation => this.addRelations(quads, identifier.path, baseIdentifier, relation));
        members.forEach(m => this.addMember(quads, m));

        return new BasicRepresentation(
            guardedStreamFrom(quads),
            new RepresentationMetadata(this.getMetadata(await fragment.getCacheDirectives()))
        );
    }

    private getMetadata(cache?: CacheDirectives): MetadataRecord {
        if (!cache) return { [CONTENT_TYPE]: INTERNAL_QUADS };

        const cacheLit = cacheToLiteral(cache);
        return { [HTTP.cache_control]: literal(cacheLit), [CONTENT_TYPE]: INTERNAL_QUADS };
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
