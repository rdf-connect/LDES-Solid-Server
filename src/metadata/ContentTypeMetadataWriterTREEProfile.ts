import { HttpResponse, MetadataWriter, RepresentationMetadata } from "@solid/community-server";

/**
 * Adds the `Content-Type` header with value and the TREE profile as profile parameter
 */
export class ContentTypeMetadataWriterTREEProfile extends MetadataWriter {

    public async handle(input: { response: HttpResponse; metadata: RepresentationMetadata }): Promise<void> {
        const { contentTypeObject } = input.metadata;
        if (contentTypeObject) {
            input.response.setHeader('Content-Type', `${contentTypeObject.toHeaderValueString()};profile="https://w3id.org/tree/profile"`);
        }
    }
}
