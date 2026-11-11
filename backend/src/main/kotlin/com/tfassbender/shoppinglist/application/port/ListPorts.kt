package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId

interface ShoppingListRepository {
    fun findById(spaceId: SpaceId, listId: ListId): ShoppingList?

    /** All lists of the space including tombstones (deleted lists). */
    fun findBySpace(spaceId: SpaceId): List<ShoppingList>
    fun save(list: ShoppingList)
}

/**
 * The per-space sequence counter: every change in a space gets the next number, and clients fetch
 * "everything changed since N". Must be called while holding the space lock.
 */
interface SequenceCounter {
    fun next(spaceId: SpaceId): Long
    fun current(spaceId: SpaceId): Long
}
