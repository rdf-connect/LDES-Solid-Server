import { RelationType } from "@treecg/types";

export type DataCollectionDocument = {
  id: string;
  data: string;
  timestamp?: string;
};

export type MetaCollectionDocument = {
  id: string;
  value: string;
  type: string;
};

export type IndexCollectionDocument = {
  id: string;
  streamId: string;
  root: boolean;
  immutable?: boolean;
  members?: string[];
};

export type RelationCollectionDocument = {
  bucket: string;
  from: string;
  type: RelationType;
  path?: string;
  value?: string;
};
