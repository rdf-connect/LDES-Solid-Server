import * as RDF from "@rdfjs/types";
import {Fragment} from "../index";

/**
 * Interface representing a LDES view. All mounted view should serve the same dataset.
 */
export interface View {
    /**
     * Initialize function is called when mounting this view (before any other invocation).
     * Also returns the URI that represents the root of the view (or undefined for partial view or something).
     *
     * @param base - The base URI for this LDES store
     * @param prefix - The prefix for this view
     * @returns - Promise that results to the optional root of this view
     */
    init(base: string, prefix: string): Promise<void>;
    getRoot(): string | undefined;
    /**
     * Function requesting the metadata of this view, this metadata should contain all required information for query agents.
     */
    getMetadata(ldes: string): Promise<RDF.Quad[]>;
    /**
     * Function requesting a single {@link Fragment}.
     *
     * @param identifier - identifier for this fragment (without the hostname and without the view prefix)
     */
    getFragment(identifier: string): Promise<Fragment>;
}
