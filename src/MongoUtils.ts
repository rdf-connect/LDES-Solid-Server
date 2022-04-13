import * as mongoDB from 'mongodb';

export class MongoConnection {
    private readonly db: Promise<mongoDB.Db>;
    private readonly defaultCollection: string;

    constructor(conn = "mongodb://localhost:27017", dbName = "local", collection = "gemeenten_enzo") {
        this.defaultCollection = collection;
        this.db = new Promise(async (res) => {
            const client: mongoDB.MongoClient = new mongoDB.MongoClient(conn);
            await client.connect();

            res(client.db(dbName));
        });
    }

    connection(collection?: string): Promise<mongoDB.Collection<mongoDB.Document>> {
        const colName = collection || this.defaultCollection;
        return this.db.then(db => db.collection(colName))
    }
}