
export class Node<T> {
    public readonly item: T;
    public next?: Node<T>;
    public prev?: Node<T>;

    private list: List<T>;

    constructor(item: T, list: List<T>) {
        this.item = item;
        this.list = list;
    }

    append(item: T): Node<T> {
        const node = new Node(item, this.list);
        this.list.length += 1;
        node.prev = this;
        node.next = this.next;
        if (this == this.list.tail) {
            this.list.tail = node;
        }
        if (this.next) {
            this.next.prev = node;
        }
        this.next = node;

        return node;
    }

    prepend(item: T): Node<T> {
        const node = new Node(item, this.list);
        this.list.length += 1;
        node.next = this;
        node.prev = this.prev;

        if (this == this.list.head) {
            this.list.head = node;
        }

        if (this.prev) {
            this.prev.next = node;
        }

        this.prev = node;
        return node;
    }

    remove(): T {
        const out = this.item;
        this.list.length -= 1;
        if (this == this.list.head) {
            this.list.head = this.next;
        }
        if (this == this.list.tail) {
            this.list.tail = this.prev;
        }

        if (this.prev) {
            this.prev.next = this.next;
        }
        if (this.next) {
            this.next.prev = this.prev;
        }

        return out;
    }
}

export class List<T> {
    public length = 0;
    public head?: Node<T>;
    public tail?: Node<T>;

    constructor(...items: T[]) {
        for (const item of items) {
            this.append(item);
        }
    }

    *iter(): Generator<Node<T>> {
        let current = this.head;
        while (current) {
            yield current;
            current = current.next;
        }
    }

    append(item: T): Node<T> {
        if (this.tail) {
            return this.tail.append(item);
        }

        const node = new Node(item, this);
        this.head = node;
        this.length += 1;
        this.tail = node;

        return node;
    }

    findFirst(filter: (node: Node<T>) => boolean): Node<T> | undefined {
        for (const node of this.iter()) {
            if (filter(node)) {
                return node;
            }
        }

        return;
    }
}