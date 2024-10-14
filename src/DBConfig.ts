export class DBConfig {
    readonly url: string;
    readonly meta: string;
    readonly data: string;
    readonly index: string;

    constructor(
        metaCollection: string,
        membersCollection: string,
        indexCollection: string,
        dbUrl?: string,
    ) {
        this.meta = metaCollection;
        this.data = membersCollection;
        this.index = indexCollection;

        this.url = dbUrl || "mongodb://localhost:27017/ldes";
    }
}
