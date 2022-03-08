import { DataFactory, Literal, NamedNode, Quad } from "n3";
import { stdout } from "process";
import { ConstraintType, FragmentationStrategy } from "../src/fragments";
const { namedNode, literal, blankNode, quad } = DataFactory;
import * as N3 from "n3";

import { newFragmentationStrategyField, PathFragmentationStrategy, Store, PojoConfig } from "../src/memory";
import { guardedStreamFrom, guardStream } from "@solid/community-server";

test('two plus two', () => {
    const value = 2 + 2;
    expect(value).toBeGreaterThan(3);
    expect(value).toBeGreaterThanOrEqual(3.5);
    expect(value).toBeLessThan(5);
    expect(value).toBeLessThanOrEqual(4.5);

    // toBe and toEqual are equivalent for numbers
    expect(value).toBe(4);
    expect(value).toEqual(4);
});


class Foo {
    public readonly x: number;
    public readonly y: number;
    public readonly z: number;
    constructor(x: number, y: number, z: number) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}

function newFragmentationStrategy(): FragmentationStrategy<Foo> {
    const zConstraint =
        newFragmentationStrategyField<Foo>("z", ConstraintType.GT, parseInt);
    const yConstraint =
        newFragmentationStrategyField<Foo>("y", ConstraintType.GT, parseInt);
    const xConstraint =
        newFragmentationStrategyField<Foo>("x", ConstraintType.GT, parseInt);
    return new PathFragmentationStrategy([
        zConstraint, yConstraint, xConstraint
    ]);
}

function newStore(items: number = 3): Store<Foo> {
    return new Store(newFragmentationStrategy(), items, undefined);
}

function preloadStore(store: Store<Foo>, items: number = 100) {
    const config = new PojoConfig();
    const n = (x: number, y: number, z: number) => config.toQuad(new Foo(x, y, z));

    for (let i = 0; i < items; i++) {
        store.push(n(i, Math.round(i / 5), i % 3), null);
    }
}

test('what happens happens', async () => {
    const store = newStore(5);
    preloadStore(store, 100);

    const resp = await store.fetch({ "path": "/0/5/1" });
    await new Promise(fulfull => {

        let string = '';
        const stream = {
            write: (quad: any) => { console.log(quad); string += quad.toString(); },
            end: () => { console.log(string); fulfull(null); },
        };

        const writer = new N3.StreamWriter(stream, { end: true, prefixes: { c: 'http://example.org/cartoons#' } });
        writer.import(guardedStreamFrom(resp.members));
        writer.pipe(stdout);
        writer.on("end", fulfull);

    });

    expect(false).toBe(true);
})


test("writer can read", () => {
    return;
    let string = '';
    const stream = {
        write: (quad: any) => { console.log(quad); string += quad.toString(); },
        end: () => { console.log(string); },
    };

    const writer = new N3.Writer(stream, { end: false, prefixes: { c: 'http://example.org/cartoons#' } });
    writer.addQuad(
        writer.blank(
            new NamedNode('http://xmlns.com/foaf/0.1/givenName'),
            new Literal('Tom')),
        new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
        new NamedNode('http://example.org/cartoons#Cat')
    );
    writer.addQuad(new Quad(
        new NamedNode('http://example.org/cartoons#Jerry'),
        new NamedNode('http://xmlns.com/foaf/0.1/knows'),
        writer.blank([{
            predicate: new NamedNode('http://www.w3.org/1999/02/22-rdf-syntax-ns#type'),
            object: new NamedNode('http://example.org/cartoons#Cat'),
        }, {
            predicate: new NamedNode('http://xmlns.com/foaf/0.1/givenName'),
            object: new Literal('Tom'),
        }])
    ));

    console.log("\n");

    expect(false).toBe(true);
})