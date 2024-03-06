
import { CacheDirectives } from "@treecg/types";

export function cacheToLiteral(instruction: CacheDirectives): string {
    const pub = instruction.pub ? ["public"] : ["private"];
    const maxAge = instruction.maxAge ? ["max-age=" + instruction.maxAge] : [];
    const immutable = instruction.immutable ? ["immutable"] : [];

    return [...pub, ...maxAge, ...immutable].join(", ");
}

export type Parsed = { segs: string[], query: { [label: string]: string } };

export function parseIndex(index: string): Parsed {
    const [first, second] = index.split('?', 2);
    const query: { [label: string]: string } = {};

    if (second) {
        second.split("&").forEach(q => {
            const [key, value] = q.split("=", 2);
            query[key] = decodeURIComponent(value);
        })
    }

    if (first.length == 0) {
        return { segs: [], query };
    }
    return { segs: decodeURIComponent(first).split("/"), query };
}

export function reconstructIndex({ segs, query }: Parsed): string {
    const path = segs.join("/");
    const queries = [];

    for (let [key, value] of Object.entries(query)) {
        queries.push(`${key}=${value}`);
    }

    if (queries.length > 0) {
        return encodeURI(`${path}?${queries.join("&")}`);
    } else {
        return path;
    }
}
