import * as RDF from "@rdfjs/types";
import { ResourceIdentifier } from "@solid/community-server";
import * as N3 from "n3";
import { Readable } from "stream";

export interface ReadStream {
    createReadStream(url: string, options?: any): Readable;
}

export interface Initializable {
    initialize(): Promise<any>;
}

export interface Wrapper<T extends any> {
    inner: T;
}

export interface RetentionPolicy {
    get(): void;
}
export class RetentionPolicyImpl {
    get() {

    }
}

export interface StreamConstructor {
    create(): Promise<Readable>;
}

export interface StreamWriter {
    push(quads: N3.Quad[], retentionPolicy: RetentionPolicy): Promise<void>;

}

export interface FragmentFetcher {
    fetch(id: ResourceIdentifier): Promise<Fragment>;
}

export type TreeRelation = {
    nodeId: string;
    type: ConstraintType;
    value: RDF.Term;
    path: RDF.Term;
    remainingItems?: number;
};

export type CacheDirectives = any;

export class ConstraintType {
    public static LT = new ConstraintType("LT");
    public static LTE = new ConstraintType("LTE");
    public static GT = new ConstraintType("GT");
    public static GTE = new ConstraintType("GTE");
    public static EQ = new ConstraintType("EQ");
    public static NE = new ConstraintType("NE");

    protected readonly _type: string;

    constructor(type: string, check = true) {
        this._type = type;

        if (check) {
            switch (type) {
                case "LT": return ConstraintType.LT;
                case "LTE": return ConstraintType.LTE;
                case "GT": return ConstraintType.GT;
                case "GTE": return ConstraintType.GTE;
                case "EQ": return ConstraintType.EQ;
                case "NE": return ConstraintType.NE;
            }
        }
    }

    isOpenInterval(): boolean {
        return this._type != ConstraintType.LTE._type && this != ConstraintType.GTE;
    }

    valid<P>(v1: P, v2: P): boolean {
        switch (this) {
            case ConstraintType.LT:
                return v1 < v2;

            case ConstraintType.LTE:
                return v1 <= v2;

            case ConstraintType.GT:
                return v1 > v2;

            case ConstraintType.GTE:
                return v1 >= v2;

            case ConstraintType.EQ:
                return v1 == v2;

            case ConstraintType.NE:
                return v1 != v2;
        }
        throw new Error("How dare you instantiate other ConstraintType!")
    }
}

export interface Fragment {
    metadata: any;
    members: N3.Quad[];
    relations: TreeRelation[];
    cache: CacheDirectives;
}