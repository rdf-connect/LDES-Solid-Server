import { Comparable } from '../dist/types';
import { SortedData, Input, Get, Add } from '../dist/Memory';

class NamedNode {
    public termType = "NamedNode";
    public value: string;
    constructor(value: string) {
        this.value = value;
    }

    equals(other: any): boolean {
        return other.termType && other.termType == this.termType &&
            other.value && other.value == this.value;
    }
}

class CmpInt implements Comparable {
    private readonly t: number;
    constructor(t: number) {
        this.t = t;
    }

    cmp(other: this): number {
        return other.t - this.t;
    }

    toAdd(): Input<CmpInt> & Add {
        return {
            type: "ADD",
            key: this.t.toString(),
            index: this
        }
    }

    toGet(): Input<CmpInt> & Get {
        return {
            type: "GET",
            key: this.t.toString(),
            index: this
        }
    }
}

function getMember(id: string): any {
    return { id: new NamedNode(id), quads: [] };
}

test("sorred data works as expected", async () => {
    const data = new SortedData<CmpInt>();

    for (let i of [1, 3, 5]) {
        const { builder } = await data.with(new CmpInt(i).toAdd());
        let nbuilder = builder;
        for (let j of [2, 4]) {
            const { builder } = await nbuilder.with(new CmpInt(j).toAdd());
            for (let k of [7, 9]) {
                await builder.finish(getMember("" + (i + j + k)))
            }
        }
    }

    let builder = (await data.with(
        new CmpInt(1).toGet()
    )).builder;
    builder = (await builder.with(
        new CmpInt(2).toGet()
    )).builder;

    const members = await builder.finish()

    expect(members.length).toBe(2);
    expect(members).toEqual([1 + 2 + 7, 1 + 2 + 9]);
})