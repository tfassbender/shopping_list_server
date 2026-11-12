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
    /** Space sequence number of the last change of this entry, so a pull can send only changed entries. */
    val seq: Long = 0,
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
    /**
     * Space sequence number of the last change clients must take over as a whole: categories, units, or
     * removed/renamed history entries. Added or updated history entries carry their own [HistoryEntry.seq]
     * instead - checking items updates them all the time, and a pull then only sends those entries.
     */
    val seq: Long = 0,
) {

    fun category(id: CategoryId): Category? = categories.firstOrNull { it.id == id }

    fun addCategory(category: Category): SpaceCatalog {
        if (category(category.id) != null) {
            throw DomainException(ErrorKind.CONFLICT, "CATEGORY_EXISTS", "Category ${category.id.value} exists")
        }
        requireUniqueName(category.name, except = null)
        if (categories.size >= MAX_CATEGORIES) {
            throw DomainException(ErrorKind.VALIDATION, "TOO_MANY_CATEGORIES", "At most $MAX_CATEGORIES categories")
        }
        return copy(categories = categories + category)
    }

    fun updateCategory(id: CategoryId, name: String, color: String): SpaceCatalog {
        requireCategory(id)
        requireUniqueName(name, except = id)
        return copy(categories = categories.map { if (it.id == id) Category(id, name.trim(), color) else it })
    }

    /** Two categories with the same name (ignoring case and spaces) couldn't be told apart in the dialogs. */
    private fun requireUniqueName(name: String, except: CategoryId?) {
        if (categories.any { it.id != except && normalize(it.name) == normalize(name) }) {
            throw DomainException(ErrorKind.CONFLICT, "CATEGORY_EXISTS", "A category named '${name.trim()}' exists")
        }
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

    /**
     * Marks the history entries that differ from [before] with [seq]. If entries were dropped (history full),
     * clients can't tell that from changed entries, so the whole catalog counts as changed.
     */
    fun stampHistoryChanges(before: SpaceCatalog, seq: Long): SpaceCatalog {
        val stamped = history.mapValues { (key, entry) -> if (before.history[key] == entry) entry else entry.copy(seq = seq) }
        val dropped = !history.keys.containsAll(before.history.keys)
        return copy(history = stamped, seq = if (dropped) seq else this.seq)
    }

    /** History entries added or updated after [since], alphabetically. */
    fun historyChangedSince(since: Long): List<HistoryEntry> = historyEntries().filter { it.seq > since }

    /** All remembered items, alphabetically – for managing the history. */
    fun historyEntries(): List<HistoryEntry> = history.values.sortedBy { it.name.lowercase() }

    /** Forgets an item: it is no longer suggested and no longer placed automatically. */
    fun removeHistory(name: String): SpaceCatalog {
        val key = requireHistoryKey(name)
        return copy(history = history - key)
    }

    /**
     * Renames a remembered item (e.g. a typo). If the new name is already known, both entries are merged:
     * the counts are added and the category/unit of the more recently used one is kept.
     */
    fun renameHistory(name: String, newName: String): SpaceCatalog {
        val key = requireHistoryKey(name)
        val trimmed = newName.trim()
        validateText(trimmed, MAX_HISTORY_NAME_LENGTH, "INVALID_NAME")
        val renamed = history.getValue(key).copy(name = trimmed)
        val newKey = normalize(trimmed)
        val existing = history[newKey]?.takeIf { newKey != key }
        val merged = if (existing == null) renamed else merge(renamed, existing)
        return copy(history = history - key + (newKey to merged))
    }

    private fun merge(renamed: HistoryEntry, existing: HistoryEntry): HistoryEntry {
        val newer = if (renamed.lastUsed >= existing.lastUsed) renamed else existing
        val older = if (newer === renamed) existing else renamed
        return HistoryEntry(
            name = renamed.name,
            categoryId = newer.categoryId ?: older.categoryId,
            unit = newer.unit ?: older.unit,
            usageCount = renamed.usageCount + existing.usageCount,
            lastUsed = newer.lastUsed,
        )
    }

    private fun requireHistoryKey(name: String): String = normalize(name).takeIf { it in history }
        ?: throw DomainException(ErrorKind.NOT_FOUND, "HISTORY_ENTRY_NOT_FOUND", "No remembered item '$name'")

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
        /** Same limit as item names in lists. */
        const val MAX_HISTORY_NAME_LENGTH = 100

        fun normalize(name: String): String = name.trim().lowercase().replace(Regex("\\s+"), " ")
    }
}

private fun validateText(value: String, maxLength: Int, code: String) {
    if (value.isBlank() || value != value.trim() || value.length > maxLength) {
        throw DomainException(ErrorKind.VALIDATION, code, "Must be 1-$maxLength characters: '$value'")
    }
}
