import { List } from '../dist/LinkedList';

function llToArray<T>(ll: List<T>): T[] {
    return [...ll.iter()].map(x => x.item);
}

test("Linked list works as expected", () => {
    const ll = new List<number>();
    expect(ll.length).toBe(0);

    const n1 = ll.append(1);
    expect(ll.length).toBe(1);
    expect(llToArray(ll)).toEqual([1]);
    expect(ll.tail).toBe(ll.head);
    expect(ll.tail).toBe(n1)


    const n2  = ll.append(2);
    expect(ll.length).toBe(2);
    expect(llToArray(ll)).toEqual([1, 2]);
    expect(n2.prev).toBe(n1);
    expect(ll.head).toBe(n1)
    expect(ll.tail).toBe(n2)

    ll.tail!.remove();
    expect(ll.length).toBe(1);
    expect(llToArray(ll)).toEqual([1]);
    expect(ll.tail).toBe(ll.head);
    expect(ll.tail!.prev).toBeUndefined();
    expect(ll.tail!.next).toBeUndefined();
})