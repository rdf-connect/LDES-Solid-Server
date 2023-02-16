import {createUriAndTermNamespace} from "@solid/community-server";

export const HTTP = createUriAndTermNamespace('urn:npm:solid:community-server:http:',
    'cache_control',
);

export const DCAT = createUriAndTermNamespace('http://www.w3.org/ns/dcat#',
    'Dataset',
    'DataService',
    'servesDataset',
    'contactPoint',
    'endpointURL');
