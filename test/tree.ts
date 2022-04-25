import { Tree, TreeData } from '../dist/Tree';

test("Tree works as expected", () => {
    const tree: TreeData<number> = Tree.create();

    {
        const t1 = Tree.get(tree, "_1")
        const a1 = Tree.get(t1, "a1");
        Tree.get(a1, "b1").value = 1;
        Tree.get(a1, "b2").value = 2;
        const a2 = Tree.get(t1, "a2");
        Tree.get(a2, "b3").value = 3;
        Tree.get(a2, "b4").value = 4;
    }

    {
        const t1 = Tree.get(tree, "_2")
        const a1 = Tree.get(t1, "a3");
        Tree.get(a1, "b5").value = 5;
        Tree.get(a1, "b6").value = 6;
        const a2 = Tree.get(t1, "a4");
        Tree.get(a2, "b7").value = 7;
        Tree.get(a2, "b8").value = 8;
    }

    const paths = [];
    const leaves = [];
    for (let path of Tree.paths(tree, true)) {
        paths.push(path.rootPath.slice());
        leaves.push(path.value);
    }

    expect(paths.length).toBe(8);
    expect(leaves).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})
