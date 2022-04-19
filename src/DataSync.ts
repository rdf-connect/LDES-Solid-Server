import { readFile, writeFile } from "node:fs/promises";
import { watch } from "fs/promises";

export interface DataSync<T> {
    update(f: (value: T) => Promise<T>): Promise<void>;
    get(): Promise<T>;
    save(t: T): Promise<void>;
}

export class MemoryDataSync<T> implements DataSync<T | undefined> {
    private inner: T | undefined = undefined;
    async update(f: (value: T | undefined) => Promise<T>): Promise<void> {
        this.inner = await f(this.inner);
    }
    async get(): Promise<T | undefined> {
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
    async get(): Promise<T | undefined> {
        return this.inner;
    }
    save(t: T | undefined): Promise<void> {
        this.inner = t;

        return writeFile(this.location, JSON.stringify(t));
    }
}
