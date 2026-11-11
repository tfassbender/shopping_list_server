package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId

interface CatalogRepository {
    /** The catalog of the space; an empty one if none was saved yet. */
    fun find(spaceId: SpaceId): SpaceCatalog
    fun save(catalog: SpaceCatalog)
}
