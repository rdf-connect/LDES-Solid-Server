
import { CacheDirectives, TREE } from "@treecg/types";
import { Quad, Quad_Subject } from "@rdfjs/types";
import { Store, DataFactory, Parser } from "n3";
import { access, constants, readFile } from "fs/promises";
import { RDF, SHACL } from "@treecg/types";

const { quad, namedNode } = DataFactory;

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

export async function getShapeQuads(id: string, shapes: string[]): Promise<Quad[]> {
    const quads: Quad[] = [];
    for (const shape of shapes) {
        try {
            // A remote shape reference was given
            new URL(shape);
            quads.push(
                quad(
                    namedNode(id),
                    TREE.terms.shape,
                    namedNode(shape)
                )
            );
        } catch {
            // A full local shape file was given
            await access(shape, constants.F_OK);
            const shapeStore = new Store(
                new Parser().parse(await readFile(shape, { encoding: "utf8" }))
            );
            const shapeId = extractMainNodeShape(shapeStore);
            quads.push(
                quad(
                    namedNode(id),
                    TREE.terms.shape,
                    shapeId
                )
            );
            quads.push(...shapeStore.getQuads(null, null, null, null));
        }
    }

    return quads;
}

/**
 * Find the main sh:NodeShape subject of a given Shape Graph.
 * We determine this by assuming that the main node shape
 * is not referenced by any other shape description.
 * If more than one is found an exception is thrown.
**/
export function extractMainNodeShape(store: Store): Quad_Subject {
    const nodeShapes = store.getSubjects(RDF.type, SHACL.NodeShape, null);
    let mainNodeShape = null;

    if (nodeShapes && nodeShapes.length > 0) {
        for (const ns of nodeShapes) {
            const isNotReferenced = store.getSubjects(null, ns, null).length === 0;

            if (isNotReferenced) {
                if (!mainNodeShape) {
                    mainNodeShape = ns;
                } else {
                    throw new Error("There are multiple main node shapes in a given shape graph."
                        + "Unrelated shapes must be given as separate shapes");
                }
            }
        }
        if (mainNodeShape) {
            return mainNodeShape;
        } else {
            throw new Error("No main SHACL Node Shapes found in given shape graph");
        }
    } else {
        throw new Error("No SHACL Node Shapes found in given shape graph");
    }
}
