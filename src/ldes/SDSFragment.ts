import { CacheDirectives, Member } from "@treecg/types";
import { Fragment, RelationParameters } from "./Fragment";
import { Repository } from "../repositories/Repository";

export class SDSFragment implements Fragment {
    members: string[];
    relations: RelationParameters[];
    repository: Repository;

    cacheDirectives: CacheDirectives;

    constructor(
        members: string[],
        relations: RelationParameters[],
        repository: Repository,
        cacheDirectives: CacheDirectives,
    ) {
        this.repository = repository;
        this.members = members;
        this.relations = relations;
        this.cacheDirectives = cacheDirectives;
    }

    async getMembers(): Promise<Member[]> {
        return await this.repository.findMembers(this.members);
    }

    async getRelations(): Promise<RelationParameters[]> {
        return this.relations;
    }

    async getCacheDirectives(): Promise<CacheDirectives> {
        return this.cacheDirectives;
    }
}
