package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.user.ItemOrder

/**
 * Sorts the items of a list for walking through a shop. Keys, most important first:
 * 1. checked items to the end (if the user wants that),
 * 2. position in the layout – the item's category (mode CATEGORIES) or the item itself (mode ITEMS);
 *    categories missing in the layout follow in the space's category order, items without category
 *    or unknown to the layout come last,
 * 3. the user's [ItemOrder]: order of adding (creation time, then name) or name (case-insensitive, then
 *    creation time). Deliberately nothing that changes when an item is checked (like "most bought"), so
 *    checking an item never moves it.
 *
 * Pure function in the domain, so every client (web, Android, AI agents) gets the same order.
 */
object ItemSorter {

    fun sort(
        items: List<Item>,
        layout: ShopLayout,
        catalog: SpaceCatalog,
        checkedToEnd: Boolean,
        itemOrder: ItemOrder = ItemOrder.ADDED,
    ): List<Item> {
        val position = positionFunction(layout, catalog)
        val comparator = compareBy<Item> { if (checkedToEnd && it.checked) 1 else 0 }
            .thenBy(position)
        val withinPosition = when (itemOrder) {
            ItemOrder.ADDED -> comparator.thenBy { it.createdAt }.thenBy { it.name.lowercase() }
            ItemOrder.ALPHABETICAL -> comparator.thenBy { it.name.lowercase() }.thenBy { it.createdAt }
        }
        return items.sortedWith(withinPosition)
    }

    private fun positionFunction(layout: ShopLayout, catalog: SpaceCatalog): (Item) -> Int = when (layout.mode) {
        LayoutMode.CATEGORIES -> {
            // Layout order first, then remaining categories of the space in their default order.
            val existing = catalog.categories.map { it.id }
            val order = layout.categoryOrder.filter { it in existing } + existing.filterNot { it in layout.categoryOrder }
            val index = order.withIndex().associate { (i, id) -> id to i }
            val unknown = order.size
            { item -> item.categoryId?.let { index[it] } ?: unknown }
        }
        LayoutMode.ITEMS -> {
            val index = layout.itemOrder.withIndex().associate { (i, name) -> SpaceCatalog.normalize(name) to i }
            val unknown = index.size
            { item -> index[SpaceCatalog.normalize(item.name)] ?: unknown }
        }
    }
}
