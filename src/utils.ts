
import { CacheDirectives } from "@treecg/types";

export function cacheToLiteral(instruction: CacheDirectives): string {
    const pub = instruction.pub ? ["public"] : ["private"];
    const maxAge = instruction.maxAge ? ["max-age=" + instruction.maxAge] : [];
    const immutable = instruction.immutable ? ["immutable"] : [];

    return [...pub, ...maxAge, ...immutable].join(", ");
}
