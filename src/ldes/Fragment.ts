import { CacheDirectives, RelationType } from "@treecg/types";
import type * as RDF from "@rdfjs/types";
import { Parser } from "n3";
import { Member } from "../repositories/Repository";

export type RdfThing = {
    id: RDF.Term;
    quads: RDF.Quad[];
};

export function parseRdfThing(value: string): RdfThing {
    const quads = new Parser().parse(value);

    const subjectIdx = quads.findIndex(
        (q) =>
            q.subject.value === "" &&
            q.predicate.value === "http://purl.org/dc/terms/subject",
    );
    if (subjectIdx < 0) throw "No valid subject found for RdfThing";
    const [subject] = quads.splice(subjectIdx, 1);

    return {
        id: subject.object,
        quads,
    };
}

export interface RelationParameters {
    nodeId: string;
    type: RelationType;
    value?: RdfThing;
    path?: RdfThing;
    remainingItems?: number;
}

export interface Timestamps {
    created: number,
    updated: number,
}

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
     * Fetch or return timestamps for this fragment
     */
    getTimestamps(): Promise<Timestamps>;
}
