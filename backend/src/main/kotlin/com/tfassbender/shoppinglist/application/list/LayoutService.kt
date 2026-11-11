package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.FavoritesRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.ItemSorter
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserFavorites
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.util.UUID

/** Shop layouts of a space (every member may manage them), personal favorites and sorting. */
@ApplicationScoped
class LayoutService(
    private val layouts: LayoutRepository,
    private val favorites: FavoritesRepository,
    private val catalogs: CatalogRepository,
    private val lists: ShoppingListRepository,
    private val users: UserRepository,
    private val sequence: SequenceCounter,
    private val access: SpaceAccess,
    private val locks: SpaceLocks,
    private val clock: Clock,
) {

    fun layouts(userId: UserId, spaceId: SpaceId): List<ShopLayout> {
        access.requireMember(spaceId, userId)
        return layouts.findBySpace(spaceId).sortedBy { it.name.lowercase() }
    }

    fun get(userId: UserId, spaceId: SpaceId, layoutId: LayoutId): ShopLayout {
        access.requireMember(spaceId, userId)
        return load(spaceId, layoutId)
    }

    /** New layouts start with the space's category order, which is usually a good first guess. */
    fun create(userId: UserId, spaceId: SpaceId, name: String, mode: LayoutMode, layoutId: LayoutId? = null): ShopLayout =
        locks.withLock(spaceId) {
            access.requireMember(spaceId, userId)
            val id = layoutId ?: LayoutId(UUID.randomUUID().toString())
            if (layouts.findById(spaceId, id) != null) {
                throw DomainException(ErrorKind.CONFLICT, "LAYOUT_EXISTS", "Layout ${id.value} already exists")
            }
            val initialOrder = catalogs.find(spaceId).categories.map { it.id }
            val layout = ShopLayout.create(id, spaceId, name, mode, initialOrder, clock.instant()).copy(seq = sequence.next(spaceId))
            layouts.save(layout)
            layout
        }

    fun update(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, name: String, mode: LayoutMode): ShopLayout =
        modify(userId, spaceId, layoutId) { it.rename(name).withMode(mode) }

    fun delete(userId: UserId, spaceId: SpaceId, layoutId: LayoutId) = locks.withLock(spaceId) {
        access.requireMember(spaceId, userId)
        load(spaceId, layoutId)
        layouts.delete(spaceId, layoutId)
        sequence.next(spaceId) // clients see a new seq and refresh their layouts
    }

    fun setCategoryOrder(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, order: List<CategoryId>): ShopLayout =
        modify(userId, spaceId, layoutId) { layout ->
            val existing = catalogs.find(spaceId).categories.map { it.id }.toSet()
            if (!existing.containsAll(order)) {
                throw DomainException(ErrorKind.VALIDATION, "CATEGORY_NOT_FOUND", "Unknown category in order")
            }
            layout.withCategoryOrder(order)
        }

    fun setItemOrder(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, order: List<String>): ShopLayout =
        modify(userId, spaceId, layoutId) { it.withItemOrder(order) }

    fun connectList(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, listId: ListId): ShopLayout =
        modify(userId, spaceId, layoutId) { layout ->
            val list = lists.findById(spaceId, listId)
            if (list == null || list.deleted) throw ShoppingList.listNotFound()
            layout.connect(listId)
        }

    fun disconnectList(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, listId: ListId): ShopLayout =
        modify(userId, spaceId, layoutId) { it.disconnect(listId) }

    fun favorites(userId: UserId, spaceId: SpaceId, layoutId: LayoutId): Set<String> {
        get(userId, spaceId, layoutId)
        return favorites.find(userId).favoritesOf(layoutId)
    }

    fun addFavorite(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, itemName: String): Set<String> =
        updateFavorites(userId, spaceId, layoutId) { it.add(layoutId, itemName) }

    fun removeFavorite(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, itemName: String): Set<String> =
        updateFavorites(userId, spaceId, layoutId) { it.remove(layoutId, itemName) }

    /** Sorts the active items of a list for this user and shop (see [ItemSorter]). */
    fun sort(userId: UserId, list: ShoppingList, layoutId: LayoutId): List<ItemSorter.SortedItem> {
        val layout = get(userId, list.spaceId, layoutId)
        val checkedToEnd = users.findById(userId)?.settings?.checkedItemsToEnd ?: true
        return ItemSorter.sort(
            items = list.activeItems,
            layout = layout,
            catalog = catalogs.find(list.spaceId),
            favorites = favorites.find(userId).favoritesOf(layoutId),
            checkedToEnd = checkedToEnd,
        )
    }

    // Favorites are personal (one file per user), so they don't need the space lock; the
    // per-user race of two parallel favorite toggles is harmless.
    private fun updateFavorites(
        userId: UserId,
        spaceId: SpaceId,
        layoutId: LayoutId,
        change: (UserFavorites) -> UserFavorites,
    ): Set<String> {
        get(userId, spaceId, layoutId)
        val updated = change(favorites.find(userId))
        favorites.save(updated)
        return updated.favoritesOf(layoutId)
    }

    private fun modify(userId: UserId, spaceId: SpaceId, layoutId: LayoutId, change: (ShopLayout) -> ShopLayout): ShopLayout =
        locks.withLock(spaceId) {
            access.requireMember(spaceId, userId)
            val updated = change(load(spaceId, layoutId)).copy(seq = sequence.next(spaceId))
            layouts.save(updated)
            updated
        }

    private fun load(spaceId: SpaceId, layoutId: LayoutId): ShopLayout = layouts.findById(spaceId, layoutId)
        ?: throw DomainException(ErrorKind.NOT_FOUND, "LAYOUT_NOT_FOUND", "No layout ${layoutId.value}")
}
