package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.Item
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.CatalogDefaults
import com.tfassbender.shoppinglist.domain.space.Category
import com.tfassbender.shoppinglist.domain.space.HistoryEntry
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.util.UUID

/** Categories, units and item history of a space. Every member may edit them. */
@ApplicationScoped
class CatalogService(
    private val catalogs: CatalogRepository,
    private val sequence: SequenceCounter,
    private val access: SpaceAccess,
    private val locks: SpaceLocks,
    private val clock: Clock,
) {

    fun get(userId: UserId, spaceId: SpaceId): SpaceCatalog {
        access.requireMember(spaceId, userId)
        return catalogs.find(spaceId)
    }

    fun createDefaults(spaceId: SpaceId, language: Language) = locks.withLock(spaceId) {
        catalogs.save(CatalogDefaults.create(spaceId, language).copy(seq = sequence.next(spaceId)))
    }

    fun addCategory(userId: UserId, spaceId: SpaceId, name: String, color: String, id: CategoryId? = null): SpaceCatalog =
        modify(userId, spaceId) { it.addCategory(Category(id ?: CategoryId(UUID.randomUUID().toString()), name.trim(), color)) }

    fun updateCategory(userId: UserId, spaceId: SpaceId, id: CategoryId, name: String, color: String): SpaceCatalog =
        modify(userId, spaceId) { it.updateCategory(id, name, color) }

    fun deleteCategory(userId: UserId, spaceId: SpaceId, id: CategoryId): SpaceCatalog =
        modify(userId, spaceId) { it.deleteCategory(id) }

    fun reorderCategories(userId: UserId, spaceId: SpaceId, order: List<CategoryId>): SpaceCatalog =
        modify(userId, spaceId) { it.reorderCategories(order) }

    fun setUnits(userId: UserId, spaceId: SpaceId, units: List<String>): SpaceCatalog =
        modify(userId, spaceId) { it.withUnits(units) }

    fun suggestions(userId: UserId, spaceId: SpaceId, query: String, limit: Int): List<HistoryEntry> =
        get(userId, spaceId).suggestions(query, limit.coerceIn(1, 50))

    fun history(userId: UserId, spaceId: SpaceId): List<HistoryEntry> = get(userId, spaceId).historyEntries()

    fun renameHistory(userId: UserId, spaceId: SpaceId, name: String, newName: String): List<HistoryEntry> =
        modify(userId, spaceId) { it.renameHistory(name, newName) }.historyEntries()

    fun removeHistory(userId: UserId, spaceId: SpaceId, name: String): List<HistoryEntry> =
        modify(userId, spaceId) { it.removeHistory(name) }.historyEntries()

    /**
     * Fills in what the history knows for new items without a category, so items are placed automatically
     * – for every client, including AI agents. Caller holds the space lock.
     */
    fun enrich(spaceId: SpaceId, changes: List<ListChange>): List<ListChange> {
        if (changes.none { it is ListChange.AddItem && it.categoryId == null }) return changes
        val catalog = catalogs.find(spaceId)
        return changes.map { change ->
            if (change is ListChange.AddItem && change.categoryId == null) {
                change.copy(categoryId = catalog.suggestedCategory(change.name))
            } else {
                change
            }
        }
    }

    /**
     * Updates the item history after list changes (caller holds the space lock): added or edited items teach
     * name → category/unit, checked items count as bought. Changed entries get [seq] (the seq of the list
     * changes), so the next pull delivers them to other clients.
     */
    fun recordItemChanges(spaceId: SpaceId, list: ShoppingList, changes: List<ListChange>, seq: Long) {
        val now = clock.instant()
        val before = catalogs.find(spaceId)
        val after = changes.fold(before) { catalog, change ->
            when (change) {
                is ListChange.AddItem, is ListChange.EditItem -> list.item(itemIdOf(change))?.let { catalog.learnFrom(it, now) } ?: catalog
                is ListChange.CheckItem -> list.item(change.itemId)?.let { catalog.countUsage(it.name, it.categoryId, it.unit, now) } ?: catalog
                else -> catalog
            }
        }
        if (after != before) catalogs.save(after.stampHistoryChanges(before, seq))
    }

    private fun SpaceCatalog.learnFrom(item: Item, now: java.time.Instant) =
        if (item.deleted) this else learn(item.name, item.categoryId, item.unit, now)

    private fun itemIdOf(change: ListChange) = when (change) {
        is ListChange.AddItem -> change.itemId
        is ListChange.EditItem -> change.itemId
        else -> error("not an item change")
    }

    private fun modify(userId: UserId, spaceId: SpaceId, change: (SpaceCatalog) -> SpaceCatalog): SpaceCatalog =
        locks.withLock(spaceId) {
            access.requireMember(spaceId, userId)
            val updated = change(catalogs.find(spaceId)).copy(seq = sequence.next(spaceId))
            catalogs.save(updated)
            updated
        }
}
