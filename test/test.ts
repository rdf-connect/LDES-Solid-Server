import { Params } from "../dist/types";

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

