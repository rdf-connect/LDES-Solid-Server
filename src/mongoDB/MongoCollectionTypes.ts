import {RelationType} from "@treecg/types";

export type DataCollectionDocument = {
    id: string,
    data: string,
    timestamp?: string,
};

export type MetaCollectionDocument = {
    id: string, value: string, type: string
};

export type IndexCollectionDocument = {
    id?: string,
    streamId: string,
    leaf: boolean,
    value?: string,
    relations: { type: RelationType, value: string, bucket: string, path: string, timestampRelation?: boolean }[],
    members?: string[],
    count: number,
    timeStamp?: string
};
