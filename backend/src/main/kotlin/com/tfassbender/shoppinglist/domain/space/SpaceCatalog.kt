package com.tfassbender.shoppinglist.domain.space

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.list.CategoryId
import java.time.Instant

data class Category(val id: CategoryId, val name: String, val color: String) {
    init {
        validateText(name, MAX_NAME_LENGTH, "INVALID_NAME")
        if (!COLOR.matches(color)) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_COLOR", "Color must be #RRGGBB: $color")
        }
    }

    companion object {
        const val MAX_NAME_LENGTH = 40
        private val COLOR = Regex("^#[0-9a-fA-F]{6}$")
    }
}

/**
 * What the space has learned about an item name: the last used category/unit (for automatic placement and
 * autocomplete) and how often it was bought (for "most used first").
 */
data class HistoryEntry(
    val name: String,
    val categoryId: CategoryId?,
    val unit: String?,
    val usageCount: Int,
    val lastUsed: Instant,
)

/**
 * Categories (ordered, with colors), units and item history of a space. One aggregate because they are
 * edited together rarely and are small; history keys are normalized names (case-insensitive).
 */
data class SpaceCatalog(
    val spaceId: SpaceId,
    val categories: List<Category> = emptyList(),
    val units: List<String> = emptyList(),
    val history: Map<String, HistoryEntry> = emptyMap(),
) {

    fun category(id: CategoryId): Category? = categories.firstOrNull { it.id == id }

    fun addCategory(category: Category): SpaceCatalog {
        if (category(category.id) != null) {
            throw DomainException(ErrorKind.CONFLICT, "CATEGORY_EXISTS", "Category ${category.id.value} exists")
        }
        if (categories.size >= MAX_CATEGORIES) {
            throw DomainException(ErrorKind.VALIDATION, "TOO_MANY_CATEGORIES", "At most $MAX_CATEGORIES categories")
        }
        return copy(categories = categories + category)
    }

    fun updateCategory(id: CategoryId, name: String, color: String): SpaceCatalog {
        requireCategory(id)
        return copy(categories = categories.map { if (it.id == id) Category(id, name.trim(), color) else it })
    }

    /** Deleting a category also forgets it in the history; items keep the id and show as uncategorized. */
    fun deleteCategory(id: CategoryId): SpaceCatalog {
        requireCategory(id)
        return copy(
            categories = categories.filterNot { it.id == id },
            history = history.mapValues { (_, entry) -> if (entry.categoryId == id) entry.copy(categoryId = null) else entry },
        )
    }

    /** New order given as the complete list of category ids. */
    fun reorderCategories(order: List<CategoryId>): SpaceCatalog {
        if (order.toSet() != categories.map { it.id }.toSet() || order.size != categories.size) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_ORDER", "Order must contain every category exactly once")
        }
        return copy(categories = order.map { requireCategory(it) })
    }

    /** Replaces the units (trimmed, blanks dropped, duplicates removed case-insensitively). */
    fun withUnits(newUnits: List<String>): SpaceCatalog {
        val cleaned = newUnits.map { it.trim() }.filter { it.isNotEmpty() }.distinctBy { it.lowercase() }
        cleaned.forEach { validateText(it, MAX_UNIT_LENGTH, "INVALID_UNIT") }
        if (cleaned.size > MAX_UNITS) {
            throw DomainException(ErrorKind.VALIDATION, "TOO_MANY_UNITS", "At most $MAX_UNITS units")
        }
        return copy(units = cleaned)
    }

    /** An item with this name was added or edited: remember its category and unit. */
    fun learn(name: String, categoryId: CategoryId?, unit: String?, now: Instant): SpaceCatalog =
        updateHistory(name, now) { existing ->
            existing?.copy(name = name.trim(), categoryId = categoryId, unit = unit, lastUsed = now)
                ?: HistoryEntry(name.trim(), categoryId, unit, usageCount = 0, lastUsed = now)
        }

    /** An item with this name was bought (checked): count it. */
    fun countUsage(name: String, categoryId: CategoryId?, unit: String?, now: Instant): SpaceCatalog =
        updateHistory(name, now) { existing ->
            existing?.copy(usageCount = existing.usageCount + 1, lastUsed = now)
                ?: HistoryEntry(name.trim(), categoryId, unit, usageCount = 1, lastUsed = now)
        }

    fun historyFor(name: String): HistoryEntry? = history[normalize(name)]

    /** The category the history suggests for a new item, if it still exists. */
    fun suggestedCategory(name: String): CategoryId? = historyFor(name)?.categoryId?.takeIf { category(it) != null }

    /**
     * Autocomplete: entries whose name or one of its words starts with [query] (case-insensitive), names
     * starting with the query first, then by usage count and recency.
     */
    fun suggestions(query: String, limit: Int): List<HistoryEntry> {
        val q = normalize(query)
        if (q.isEmpty()) return emptyList()
        return history.values
            .filter { entry -> normalize(entry.name).let { it.startsWith(q) || it.split(' ').any { word -> word.startsWith(q) } } }
            .sortedWith(
                compareByDescending<HistoryEntry> { normalize(it.name).startsWith(q) }
                    .thenByDescending { it.usageCount }
                    .thenByDescending { it.lastUsed }
                    .thenBy { it.name.lowercase() },
            )
            .take(limit)
    }

    private fun updateHistory(name: String, now: Instant, update: (HistoryEntry?) -> HistoryEntry): SpaceCatalog {
        val key = normalize(name)
        if (key.isEmpty()) return this
        var updated = history + (key to update(history[key]))
        if (updated.size > MAX_HISTORY) {
            // Forget the least relevant entries so the file stays small.
            updated = updated.entries.sortedWith(compareByDescending<Map.Entry<String, HistoryEntry>> { it.value.usageCount }.thenByDescending { it.value.lastUsed })
                .take(MAX_HISTORY).associate { it.key to it.value }
        }
        return copy(history = updated)
    }

    private fun requireCategory(id: CategoryId): Category = category(id)
        ?: throw DomainException(ErrorKind.NOT_FOUND, "CATEGORY_NOT_FOUND", "No category ${id.value}")

    companion object {
        const val MAX_CATEGORIES = 100
        const val MAX_UNITS = 50
        const val MAX_UNIT_LENGTH = 20
        const val MAX_HISTORY = 2000

        fun normalize(name: String): String = name.trim().lowercase().replace(Regex("\\s+"), " ")
    }
}

private fun validateText(value: String, maxLength: Int, code: String) {
    if (value.isBlank() || value != value.trim() || value.length > maxLength) {
        throw DomainException(ErrorKind.VALIDATION, code, "Must be 1-$maxLength characters: '$value'")
    }
}
