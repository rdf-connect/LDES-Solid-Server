import { DataFactory, Literal, NamedNode, Quad } from "n3";
import { stdout } from "process";
const { namedNode, literal, blankNode, quad } = DataFactory;
import * as N3 from "n3";
import { Params } from "../dist/fetcher";
import { assert } from "console";

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

test("Params works as epected", () => {
    const url = "http://test.be/param1/param2?q=test";

    const param = new Params(url);

    expect(param.path).toEqual(["param1", "param2"]);
    expect(param.query).toEqual({"q": "test"})

    param.path[1] = "new"
    expect(param.toUrl()).toEqual("http://test.be/param1/new?q=test")

    const copy = param.copy();

    copy.path[1] = "42";

    expect(param.toUrl()).toEqual("http://test.be/param1/new?q=test")
    expect(copy.toUrl()).toEqual("http://test.be/param1/42?q=test")

    copy.query['q2'] = "test2"

    expect(param.toUrl()).toEqual("http://test.be/param1/new?q=test")
    expect(copy.toUrl()).toEqual("http://test.be/param1/42?q=test&q2=test2")
})


