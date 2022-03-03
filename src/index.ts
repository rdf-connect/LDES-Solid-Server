import { Conditions, Patch, Representation, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";


export class LDESAccessorBasedStore implements ResourceStore {
  private readonly way: string;
  constructor(way: string) {
    this.way = way;
  }

  resourceExists = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<boolean> => {
    throw "Not "
  }

  getRepresentation = async (identifier: ResourceIdentifier, preferences: RepresentationPreferences, conditions?: Conditions | undefined): Promise<Representation> => {
    console.log("Get representation", identifier, preferences, conditions)
    throw "Not implemented get"
  }

  setRepresentation = async (identifier: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    throw "Not implemented set"
  }

  addResource = async (container: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier> => {
    throw "Not implemented add"
  }

  deleteResource = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    throw "Not implemented delete"
  }

  modifyResource = async (identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    throw "Not implemented modify"
  }
}
