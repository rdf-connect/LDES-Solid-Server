// Thoughts: 
// - Something something proxy objects might be useful
//   Just use DataSync things and use these functions wihtout classes to utilize the tree structure


type ToString<T> = (foo: T) => string;
export type Node<Index, T> = { [label: string]: [Index, T] };

function isCont<D, E>(x: ["cont", D] | ["end", E]): x is ["cont", D] {
    return x[0] == "cont";
}

export interface TreeData<T> {
    value?: T,
    children: { [label: string]: TreeData<T> },
    rootPath: string[],
}

export namespace TreeTwo {
    export function create<T>(): TreeData<T> {
        return {children:{}, rootPath: []};
    }
    export function get<T>(tree: TreeData<T>, index: string): TreeData<T> {
        if (!tree.children[index]) {
            const indices = tree.rootPath.slice();
            indices.push(index);
            tree.children[index] = {
                children: {},
                rootPath: indices,
            };
        }
        return tree.children[index];
    }

    export function isLeaf<T>(tree: TreeData<T>): boolean {
        return Object.keys(tree.children).length == 0;
    }

    export function* paths<T>(tree: TreeData<T>, leafsOnly = false): Generator<TreeData<T>> {
        if (!isLeaf(tree)) {
            for (let key in tree.children) {
                if (!leafsOnly) yield tree;
                const sub = tree.children[key];
                yield* paths(sub)
            }
        } else {
            yield tree;
        }
    }

    export type TreeVisitor<T, Data, E> = (index: string, data: Data, node: TreeData<T>) => Promise<["cont", Data] | ["end", E]>;
    export async function walkTreeWith<T, Data, E>(tree: TreeData<T>, data: Data, f: TreeVisitor<T, Data, E>): Promise<E[]> {
        const out: E[] = [];

        for (let key in tree.children) {
            const sub = tree.children[key];
            const foo = await f(key, data, sub);
            if (isCont<Data, E>(foo)) {
                out.push(... await walkTreeWith(sub, foo[1], f))
            } else {
                out.push(foo[1]);
            }
        }

        return out;
    }
}

export class Tree<Index, T> {
    private readonly toString: ToString<Index>;

    private inner?: T;
    private readonly node: Node<Index, Tree<Index, T>>;

    public readonly indices: Index[];

    constructor(toString?: ToString<Index>, t?: T, indices: Index[] = []) {
        this.node = {};
        this.indices = indices;
        this.inner = t;

        if (!toString) {
            this.toString = (x: Index) => (<any>x).toString();
        } else {
            this.toString = toString;
        }
    }

    async walkTreeWith<Data, E>(data: Data, f: (index: Index, data: Data, node: Tree<Index, T>) => Promise<["cont", Data] | ["end", E]>): Promise<E[]> {
        const out: E[] = [];

        for (let key in this.node) {
            const [index, tree] = this.node[key];
            const foo = await f(index, data, tree);
            if (isCont<Data, E>(foo)) {
                out.push(...await tree.walkTreeWith(foo[1], f));
            } else {
                out.push(foo[1]);
            }
        }

        return out;
    }

    get(index: Index): Tree<Index, T> {
        const key = this.toString(index);

        if (!this.node[key]) {
            const indices = this.indices.slice()
            indices.push(index);
            this.node[key] = [index, new Tree<Index, T>(this.toString, undefined, indices)];
        }

        return this.node[key][1];
    }

    set_v(t: T) {
        this.inner = t;
    }

    update(f: (value?: T) => T | undefined) {
        const newValue = f(this.inner);
        this.inner = newValue;
    }

    get_v(): T | undefined {
        return this.inner;
    }

    isLeaf(): boolean {
        return Object.keys(this.node).length == 0;
    }

    *paths(leafsOnly: boolean = true): Generator<Tree<Index, T>> {
        if (!this.isLeaf()) {
            for (let key in this.node) {
                if (!leafsOnly) yield this;
                const [index, sub] = this.node[key];
                yield* sub.paths();
            }
        } else {
            yield this;
        }
    }
}