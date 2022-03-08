
export type Key<T> = keyof T;
export type Partial<T> = { [P in Key<T>]?: T[P] };