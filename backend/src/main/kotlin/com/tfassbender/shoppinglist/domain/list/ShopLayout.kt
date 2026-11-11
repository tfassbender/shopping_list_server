package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import java.time.Instant

@JvmInline
value class LayoutId(val value: String) {
    init {
        requireClientId(value, "layout")
    }
}

/** Sort by the order of categories (default – new items are placed automatically) or of single items. */
enum class LayoutMode { CATEGORIES, ITEMS }

/**
 * The walking order through one shop. Both orders are kept, so switching the mode loses nothing.
 * Item entries are names, matched case-insensitively, because the same product appears on many lists.
 * A layout can be connected to several lists and a list to several layouts.
 */
data class ShopLayout(
    val id: LayoutId,
    val spaceId: SpaceId,
    val name: String,
    val mode: LayoutMode,
    val categoryOrder: List<CategoryId>,
    val itemOrder: List<String>,
    val listIds: Set<ListId>,
    val createdAt: Instant,
    /** Space sequence number of the last change (for sync). */
    val seq: Long = 0,
) {
    init {
        if (name.isBlank() || name != name.trim() || name.length > MAX_NAME_LENGTH) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_NAME", "Name must be 1-$MAX_NAME_LENGTH characters")
        }
    }

    fun rename(newName: String): ShopLayout = copy(name = newName.trim())
    fun withMode(newMode: LayoutMode): ShopLayout = copy(mode = newMode)

    fun withCategoryOrder(order: List<CategoryId>): ShopLayout {
        if (order.size != order.toSet().size) throw invalidOrder()
        return copy(categoryOrder = order)
    }

    fun withItemOrder(order: List<String>): ShopLayout {
        val cleaned = order.map { it.trim() }.filter { it.isNotEmpty() }
        if (cleaned.size != cleaned.map(SpaceCatalog::normalize).toSet().size || cleaned.size > MAX_ITEM_ENTRIES) throw invalidOrder()
        if (cleaned.any { it.length > ShoppingList.MAX_ITEM_NAME_LENGTH }) throw invalidOrder()
        return copy(itemOrder = cleaned)
    }

    fun connect(listId: ListId): ShopLayout = copy(listIds = listIds + listId)
    fun disconnect(listId: ListId): ShopLayout = copy(listIds = listIds - listId)

    companion object {
        const val MAX_NAME_LENGTH = 60
        const val MAX_ITEM_ENTRIES = 1000

        fun create(id: LayoutId, spaceId: SpaceId, name: String, mode: LayoutMode, initialCategoryOrder: List<CategoryId>, now: Instant) =
            ShopLayout(id, spaceId, name.trim(), mode, initialCategoryOrder, emptyList(), emptySet(), now)

        private fun invalidOrder() =
            DomainException(ErrorKind.VALIDATION, "INVALID_ORDER", "Entries must be unique, non-blank and at most ${MAX_ITEM_ENTRIES}")
    }
}
