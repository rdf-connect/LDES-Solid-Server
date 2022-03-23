// Thoughts: 
// - Something something proxy objects might be useful
// - Should Tree know the path to the tree?
//   - Is a Path a Tree?

export type ToString<T> = (foo: T) => string;
export type Node<Index, T> = { [label: string]: [Index, T] };

function isCont<D, E>(x: ["cont", D] | ["end", E]): x is ["cont", D] {
    return x[0] == "cont";
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

    walkTreeWith<Data, E>(data: Data, f: (index: Index, data: Data, node: Tree<Index, T>) => ["cont", Data] | ["end", E]): E[] {
        const out: E[] = [];

        for (let key in this.node) {
            const [index, tree] = this.node[key];
            const foo = f(index, data, tree);
            if (isCont<Data, E>(foo)) {
                out.push(...tree.walkTreeWith(foo[1], f));
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