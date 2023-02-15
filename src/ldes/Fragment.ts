import {CacheDirectives, Member, RelationParameters} from "@treecg/types";

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
