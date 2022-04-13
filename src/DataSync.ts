import { readFile, writeFile } from "node:fs/promises";
import { watch } from "fs/promises";
import { MongoConnection } from "./MongoUtils";

export interface DataSync<T> {
    update(f: (value: T) => Promise<T>): Promise<void>;
    get(): T;
    save(t: T): Promise<void>;
}

// Not working, requires WatchStream capable mongodb
export class MongoDataSync<T> implements DataSync<T | undefined> {
    private inner: T | undefined;
    private readonly conn: MongoConnection;
    private readonly id: string;
    private readonly collection?: string;
    constructor(conn: MongoConnection, id: string, collection?: string) {
        this.id = id;
        this.collection = collection;
        this.conn = conn;

        conn.connection(collection).then(coll => {
            const pipeline = [
                { $match: { id: this.id } },
            ];

            const stream = coll.watch(pipeline);

            stream.on("change", next => {
                console.log(next);
            })
        });
    }

    async update(f: (value: T | undefined) => Promise<T>): Promise<void> {
        await this.save(await f(this.inner));
    }

    get(): T | undefined {
        return this.inner;
    }
    async save(t: T): Promise<void> {
        this.inner = t;

        const collection = await this.conn.connection(this.collection);
        await collection.findOneAndUpdate({ id: this.id }, { data: { $set: this.inner } });
    }
}

export class MemoryDataSync<T> implements DataSync<T | undefined> {
    private inner: T | undefined = undefined;
    async update(f: (value: T | undefined) => Promise<T>): Promise<void> {
        this.inner = await f(this.inner);
    }
    get(): T | undefined {
        return this.inner;
    }
    async save(t: T): Promise<void> {
        this.inner = t;
    }
}

export class FileDataSync<T> implements DataSync<T | undefined> {
    private inner: T | undefined = undefined;
    private readonly location: string;
    constructor(location: string) {
        this.location = location;
        (async () => {
            try {
                const watcher = watch(location);
                for await (const event of watcher) {
                    if (event.eventType == "change") {
                        const content = await readFile(location, "utf-8");
                        try {

                            this.inner = JSON.parse(content);
                        } catch (e) {

                            console.error("not json", content)
                            console.error(e)
                            this.inner = undefined;
                            return undefined
                        }
                    }
                }
            } catch (err: any) {
                if (err.name === 'AbortError')
                    return;
                throw err;
            }
        })()
    }

    async update(f: (value: T | undefined) => Promise<T | undefined>): Promise<void> {
        await this.save(await f(this.inner));
    }
    get(): T | undefined {
        return this.inner;
    }
    save(t: T | undefined): Promise<void> {
        this.inner = t;

        return writeFile(this.location, JSON.stringify(t));
    }
}
