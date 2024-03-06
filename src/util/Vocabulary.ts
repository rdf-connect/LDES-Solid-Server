import { createVocabulary } from "@solid/community-server";

export const HTTP = createVocabulary('urn:npm:solid:community-server:http:',
    'cache_control',
);

export const DCAT = createVocabulary('http://www.w3.org/ns/dcat#',
    'Dataset',
    'DataService',
    'servesDataset',
    'contactPoint',
    'endpointURL');
