import * as N3 from "n3";
import { Alternative, FragmentFetcherBase, PathExtractor } from "./fetcher";
import { StreamWriterBase } from "./streamWriter";
import { RetentionPolicy } from "./types";

const { namedNode, literal, blankNode, quad } = N3.DataFactory;

export interface Config<T> {
    toQuad(t: T): N3.Quad[];
    fromQuad(quads: N3.Quad[]): T
}

export class PojoConfig implements Config<any> {
    toQuad(t: any): N3.Quad[] {
        console.log("Got t", t)
        const quads: N3.Quad[] = [];
        const id = blankNode();

        for (let k in t) {
            quads.push(quad(
                id, namedNode(k), literal(t[k])
            ));
        }

        return quads;
    }

    fromQuad(quads: N3.Quad[]): any {
        const out: any = {};

        for (let quad of quads) {
            out[quad.predicate.value] = quad.object.value;
        }

        return out;
    }
}

// export abstract class FragmentationStrategyField<T, D = any, P extends keyof T = keyof T> {
//     public readonly field: P;
//     public readonly type: ConstraintType;

//     constructor(field: string, type?: ConstraintType) {
//         this.field = <P>field;
//         this.type = type || ConstraintType.GT;
//     }

//     abstract parse(value: string): D;
// }

// export class StringFragmentationStrategyField extends FragmentationStrategyField<any, string> {
//     parse(value: string): string {
//         return value;
//     }
// }

// export class DateFragmentationStrategyField extends FragmentationStrategyField<any, Date> {
//     parse(value: string): any {
//         return new Date(decodeURIComponent(value));
//     }
// }

// export class IntFragmentationStrategyField extends FragmentationStrategyField<any, number> {
//     parse(value: string): number {
//         return parseInt(value);
//     }
// }

// export interface Constraint {
//     valid(quads: N3.Quad[]): boolean;
// }

// export interface ConstaintBis {
//     interpret(quads: N3.Quad[]): number;
// }

// function parseFromPathSegments(segs: string[]): Constraint {
//     return { "valid": (_) => false }
// }

// export class PathFragmentationStrategy<T> implements FragmentationStrategy {
//     // TODO: this shouldn't be this type, more something like ConstraintExtractor
//     private readonly fields: FragmentationStrategyField<T>[];
//     private readonly base?: string;

//     constructor(fields: FragmentationStrategyField<T>[] = [], base?: string) {
//         this.fields = fields;
//         this.base = base;
//     }

//     split(path: string): [string, string[]] {
//         if (this.base) {
//             if (!path.startsWith(this.base))
//                 throw new Error("ResourceIdentifier did not start with correct base");

//             path = path.substring(this.base.length);
//         }

//         const split = path.split("/");
//         const segments = split.slice(-1 * this.fields.length);
//         if (segments.length < this.fields.length)
//             throw new Error("ResourceIdentifier did not have enough segments to be parsed");
//         const base = split.slice(0, split.length - this.fields.length).join("/") + "/";

//         return [base, segments];
//     }

//     parseConstraint({ path }: ResourceIdentifier): ParsedIdentifier<T> {
//         const [base, segments] = this.split(path);

//         const constraints: FragmentConstraints<T> = {};

//         for (let i = 0; i < segments.length; i++) {
//             constraints[this.fields[i].field] = {
//                 type: this.fields[i].type,
//                 value: this.fields[i].parse(segments[i]),
//                 parse: this.fields[i].parse
//             }
//         }

//         const getIdentifier = () => {
//             const segs = <string[]>[];
//             let adding = true;
//             for (let field of this.fields) {
//                 if (adding) {
//                     if (constraints[field.field]) {
//                         segs.push((constraints[field.field]?.value as any).toString());
//                     } else {
//                         adding = false;
//                     }
//                 } else {
//                     if (field.field in constraints) {
//                         throw new Error("Cannot add field " + field.field + " when previous field is empty");
//                     }
//                 }
//             }

//             return { path: base + segs.join("/") };
//         };

//         return { constraints, getIdentifier };
//     }

//     handlesRequest(id: ResourceIdentifier): boolean {
//         try {
//             this.parseConstraint(id);
//             return true;
//         } catch (e) {
//             return false;
//         }
//     }

//     allowedIndices(): (keyof T)[] {
//         return this.fields.map(x => x.field);
//     }
// }

// function* takeWhile<T>(fn: (t: T) => boolean, ts: T[]) {
//     for (let t of ts) {
//         if (fn(t)) yield t;
//         else return;
//     }
// }
// function* range(start: number, end: number) {
//     while (start < end) {
//         yield start++;
//     }
// }


// export class Store<T> implements StreamWriter<N3.Quad[]>, FragmentFetcher<T> {
//     private _strategy: FragmentationStrategy<T>;
//     private _items: T[] = [];
//     private _itemsPerFragment: number;
//     private _config: Config<T>;

//     private _debug: boolean;

//     constructor(fragmentationStragety?: FragmentationStrategy<T>, itemsPerFragment: number = 2, config?: Config<T>) {
//         this._strategy = fragmentationStragety || new PathFragmentationStrategy();
//         this._config = config || new PojoConfig();
//         this._itemsPerFragment = itemsPerFragment;
//         this._debug = true;
//     }

//     async push(item: N3.Quad[], retentionPolicy: any): Promise<void> {
//         const newItem = this._config.fromQuad(item);
//         this._items.push(newItem);
//     }

//     async fetch(id: ResourceIdentifier): Promise<Fragment> {
//         if (!this._strategy.handlesRequest(id)) {
//             throw new Error("Unsupported keys");
//         }

//         const params = this._strategy.parseConstraint(id);

//         const constraints = Object.keys(params.constraints).map(x => {
//             const field = <keyof T>x;
//             const { type, value, parse } = params.constraints[field]!;
//             return { field, type, value, parse };
//         });

//         if (this._debug) console.log("constraints", constraints)

//         const options = this._items.filter(a => constraints.every(c => c.type.valid(c.parse(<any>a[c.field]), c.value)));
//         options.sort((a, b) => {
//             // Maybe this sorting has to happen on all params of the strategy
//             for (let p in params.constraints) {
//                 if (a[p] < b[p]) return -1;
//                 if (a[p] > b[p]) return 1;
//             }
//             return 0;
//         });

//         if (this._debug)
//             console.log("options", options);

//         let firstItem = options[0];
//         const matchesParams = (x: T) => constraints.slice(0, -1).every(p => x[p.field] === firstItem[p.field]);

//         const items = [...takeWhile(matchesParams, options)].slice(0, this._itemsPerFragment);

//         if (this._debug)
//             console.log("items", items)

//         if (this._debug)
//             console.log("matched", [...takeWhile(matchesParams, options)])

//         const relations = <TreeRelation[]>[];
//         const remaining = options.slice(items.length);
//         for (let i = constraints.length; i >= 1; i--) {
//             // TODO optimize! No need to loop over all remaining, they are already ordered
//             // TODO make readable
//             const currentConstraint = constraints[i - 1];
//             const validItem = (t: T) => [...range(0, i)].map(i => constraints[i]).every(
//                 c => c.field == currentConstraint.field ? t[c.field] !== firstItem[c.field] : t[c.field] == firstItem[c.field]
//             );
//             const n = remaining.find(validItem);

//             if (n) {

//                 if (this._debug)
//                     console.log("adding relation on " + currentConstraint.field + " with " + n[currentConstraint.field]);

//                 const originalValue = params.constraints[currentConstraint.field]!.value;

//                 // With an openinterval this value is the same as the first found element
//                 params.constraints[currentConstraint.field]!.value = currentConstraint.type.isOpenInterval() ? firstItem[currentConstraint.field] : n[currentConstraint.field];

//                 const nodeId = params.getIdentifier();
//                 relations.push({
//                     nodeId: nodeId.path,
//                     type: currentConstraint.type,
//                     value: literal(<any>n[currentConstraint.field]),
//                     path: literal(currentConstraint.field.toString()),
//                 });

//                 // Either delete the currentConstraint from the path for a default value
//                 // Or switch back to the originalValue
//                 if (false) { }
//                 else
//                     params.constraints[currentConstraint.field]!.value = originalValue;
//             }
//         }

//         const quads = items.flatMap(this._config.toQuad);
//         if (this._debug)
//             console.log(quads);

//         const out = {
//             metadata: null, members: quads, relations, cache: null
//         };

//         if (this._debug)
//             console.log("relations", out.relations);

//         return out;
//     }

//     strategy(): FragmentationStrategy {
//         return this._strategy;
//     }
// }


export interface ToString {
    toString(this: this): string;
}

type Data = { items: N3.Quad[][], children: { [key: string]: Data } };
export class SimpleMemoryWriter<Idx extends ToString> extends StreamWriterBase<Data, Idx>  {
    async _add(quads: N3.Quad[], indices: Idx[], _retentionPolicy: RetentionPolicy): Promise<void> {
        let current = this.state;
        for (let index of indices) {
            if (!current.children[index.toString()]) {
                current.children[index.toString()] = { items: [], children: {} };
            }

            current = current.children[index.toString()];
        }

        current.items.push(quads);
    }
}

export class SimpleMemoryFetcher<Idx extends ToString> extends FragmentFetcherBase<Data, Idx> {
    // TODO: actually use this
    private readonly itemsPerFragment;
    constructor(state: Data, extractors: PathExtractor<Idx, Data>[], itemsPerFragment: number) {
        super(state, extractors);
        this.itemsPerFragment = itemsPerFragment;
    }

    async _fetch(indices: Idx[]): Promise<[N3.Quad[], Alternative<Idx>[]]> {
        let current = this.state;
        for (let index of indices) {
            if (!current.children[index.toString()]) {
                current.children[index.toString()] = { items: [], children: {} };
            }

            current = current.children[index.toString()];
        }

        return [current.items.flat(), []];
    }
}