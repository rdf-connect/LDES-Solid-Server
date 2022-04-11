
import { Member } from '@treecg/types';
import * as mongoDB from 'mongodb';
import { SimpleIndex } from '../extractor';
import { MemberStoreBase } from '../StreamWriter';
import { Tree } from '../Tree';

export async function test(conn = "mongodb://localhost:27017", dbName = "local", collection = "TUNNELS") {
    const client: mongoDB.MongoClient = new mongoDB.MongoClient(conn);
    await client.connect();

    const db: mongoDB.Db = client.db(dbName);

    const gamesCollection: mongoDB.Collection = db.collection(collection);

    console.log(`Successfully connected to database: ${db.databaseName} and collection: ${gamesCollection.collectionName}`);
}


export class MongoWriter<Idx extends SimpleIndex> extends MemberStoreBase<any, Idx> {
    async writeMetadata(metadata: any): Promise<void> {
        this.state = metadata;
    }

    async _add(quads: Member, tree: Tree<Idx, void>): Promise<void> {
        const locations = await tree.walkTreeWith(<string[]>[],
            async (index, c, node) => {
                const v = index.value.value;
                const o = c.slice();
                o.push(v);

                if (node.isLeaf()) {
                    return ["end", o];
                }
                return ["cont", o];
            }
        );

        const joined = locations.map(x => x.join("."));
        throw new Error('Method not implemented.');
    }

}