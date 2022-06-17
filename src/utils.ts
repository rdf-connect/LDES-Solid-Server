
import type * as RDF from '@rdfjs/types';
import { CacheDirectives, Member } from "@treecg/types";
import { Quad_Subject, Store } from 'n3';

import { PROV, RDF as RDFT, SDS } from '@treecg/types';

export interface Data {
    dataset?: Member,
}

export function getMember(subject: RDF.Term, store: Store, done: Set<RDF.Term>): RDF.Quad[] {
    const newQuads = store.getQuads(subject, null, null, null);
    done.add(subject);

    const newSubjects = newQuads.map(q => q.object)
        .filter(q => q.termType === "BlankNode" || q.termType == "NamedNode")
        .filter(q => !done.has(q))

    return [...newQuads, ...newSubjects.flatMap(s => getMember(s, store, done))];
}

export function extractDataset(stream: Quad_Subject, store: Store): RDF.Term | undefined {
    const datasetSub = store.getObjects(stream, SDS.terms.dataset, null);
    if (datasetSub.length < 1) return;
    return datasetSub[0];
}

export function extractData(quads: RDF.Quad[]): Data {
    const store = new Store(quads);
    const stream = store.getSubjects(RDFT.terms.type, SDS.terms.Stream, null)
        .find(sub => store.getQuads(null, PROV.terms.used, sub, null).length === 0);
    const out: Data = {};
    if (!stream) return out;

    const datasetId = extractDataset(stream, store);
    if (datasetId) {
        const member: Member = { "id": datasetId, quads: getMember(datasetId, store, new Set()) };
        out.dataset = member;
    }

    return out;
}

export function cacheToLiteral(instruction: CacheDirectives): string {
    const pub = instruction.pub ? ["public"] : ["private"];
    const maxAge = instruction.maxAge ? ["max-age=" + instruction.maxAge] : [];
    const immutable = instruction.immutable ? ["immutable"] : [];

    return [...pub, ...maxAge, ...immutable].join(", ");
}