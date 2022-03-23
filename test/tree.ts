import { Tree } from '../dist/Tree';

test("Tree works as expected", () => {
    const tree = new Tree<string, number>();

    {
        const t1 = tree.get("_1");
        t1.get("a1").get("b1").set_v(1)
        t1.get("a1").get("b2").set_v(2)
        t1.get("a2").get("b3").set_v(3)
        t1.get("a2").get("b4").set_v(4);
    }

    {
        const t1 = tree.get("_2");
        t1.get("a3").get("b5").set_v(5)
        t1.get("a3").get("b6").set_v(6)
        t1.get("a4").get("b7").set_v(7)
        t1.get("a4").get("b8").set_v(8);
    }

    const paths = [];
    const leaves = [];
    for (let path of tree.paths()) {
        paths.push(path.indices.slice());
        leaves.push(path.get_v());
    }

    expect(paths.length).toBe(8);
    expect(leaves).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})
