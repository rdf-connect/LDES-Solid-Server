
export type Node<Index, T> = { [label: string]: [Index, T] };

function isCont<D, E>(x: ["cont", D] | ["end", E]): x is ["cont", D] {
    return x[0] == "cont";
}

export interface TreeData<T> {
    value?: T,
    children: { [label: string]: TreeData<T> },
    rootPath: string[],
}

export namespace Tree {
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

    // Return Generator of all paths starting from the root.
    // if `leafsOnly` is false all nodes are described in a path depth first
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

    // Walk the tree with a TreeVisitor depth first
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
