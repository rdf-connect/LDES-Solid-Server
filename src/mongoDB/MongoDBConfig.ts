import { Db, MongoClient } from "mongodb";

export class DBConfig {
    readonly url: string;
    readonly meta: string;
    readonly data: string;
    readonly index: string;

    _client: MongoClient;
    _clientInit: Promise<unknown>;

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
        this._client = new MongoClient(this.url);
        this._clientInit = this._client.connect();
    }

    async db(): Promise<Db> {
        await this._clientInit;
        return this._client.db();
    }
}
