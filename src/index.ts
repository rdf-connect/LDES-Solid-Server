import { Conditions, getLoggerFor, Logger, Patch, Representation, RepresentationPreferences, ResourceIdentifier, ResourceStore } from "@solid/community-server";


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
    console.log("Set representation", identifier, representation, conditions)
    throw "Not implemented set"
  }

  addResource = async (container: ResourceIdentifier, representation: Representation, conditions?: Conditions | undefined): Promise<ResourceIdentifier> => {
    console.log("Add representation", container, representation, conditions)
    throw "Not implemented add"
  }

  deleteResource = async (identifier: ResourceIdentifier, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    console.log("Delete representation", identifier, conditions)
    throw "Not implemented delete"
  }

  modifyResource = async (identifier: ResourceIdentifier, patch: Patch, conditions?: Conditions | undefined): Promise<ResourceIdentifier[]> => {
    console.log("Modify representation", identifier, patch, conditions)
    throw "Not implemented modify"
  }
}
