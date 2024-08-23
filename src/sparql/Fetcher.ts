import { QueryEngine } from "@comunica/query-sparql";

const myEngine = new QueryEngine();

export class Fetcher {
    url: string;
    pageSize: number;
    query: string;

    constructor(url: string, pageSize: number, query: string) {
        this.url = url;
        this.pageSize = pageSize;
        this.query = query;
    }

    public async fetch(offset: number) {
        const query = this.query
            .replace("${offset}", offset + "")
            .replace("${pageSize}", this.pageSize + "");
        const response = await myEngine.queryQuads(query, {
            sources: [this.url],
        });
        const quads = await response.toArray();
        return quads;
    }
}
