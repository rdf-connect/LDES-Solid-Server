import { CacheDirectives, Member, RelationType } from "@treecg/types";
import type * as RDF from "@rdfjs/types";

export interface RdfThing {
  id: RDF.Term;
  quads: RDF.Quad[];
}
export interface RelationParameters {
  nodeId: string;
  type: RelationType;
  value?: RdfThing;
  path?: RdfThing;
  remainingItems?: number;
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
}
