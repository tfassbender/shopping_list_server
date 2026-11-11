package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.space.SpaceId
import java.time.Instant

@JvmInline
value class ListId(val value: String) {
    init {
        requireClientId(value, "list")
    }
}

@JvmInline
value class ItemId(val value: String) {
    init {
        requireClientId(value, "item")
    }
}

/** Client-generated ids (UUIDs) must be simple tokens: they become file names and URL segments. */
private val CLIENT_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

private fun requireClientId(value: String, kind: String) {
    if (!CLIENT_ID.matches(value)) {
        throw DomainException(ErrorKind.VALIDATION, "INVALID_ID", "Invalid $kind id: '$value'")
    }
}

@JvmInline
value class CategoryId(val value: String) {
    init {
        requireClientId(value, "category")
    }
}

/**
 * An item on a list. [seq] is the space sequence number of its last change (for "changes since" sync);
 * [deleted] marks a tombstone that is kept so other clients learn about the deletion.
 */
data class Item(
    val id: ItemId,
    val name: String,
    val quantity: String? = null,
    val unit: String? = null,
    val note: String? = null,
    val categoryId: CategoryId? = null,
    val checked: Boolean = false,
    val deleted: Boolean = false,
    val createdAt: Instant,
    val seq: Long,
) {
    val isActive: Boolean get() = !deleted
}

/**
 * A shopping list with its items. All mutations go through [apply] with a [ListChange] – the same
 * change objects the offline sync (Phase 7) will send in batches – so online REST calls, sync and AI
 * agents share one implementation.
 */
data class ShoppingList(
    val id: ListId,
    val spaceId: SpaceId,
    val name: String,
    val items: List<Item>,
    val createdAt: Instant,
    val seq: Long,
    val deleted: Boolean = false,
) {
    init {
        validateName(name, "INVALID_NAME")
    }

    val activeItems: List<Item> get() = items.filter { it.isActive }

    fun item(itemId: ItemId): Item? = items.firstOrNull { it.id == itemId }

    fun apply(change: ListChange, seq: Long, now: Instant): ShoppingList {
        if (deleted) throw listNotFound()
        return when (change) {
            is ListChange.RenameList -> copy(name = change.name.trim(), seq = seq)
            is ListChange.AddItem -> addItem(change, seq, now)
            is ListChange.EditItem -> updateItem(change.itemId, seq) { edit(it, change.field, change.value) }
            is ListChange.CheckItem -> updateItem(change.itemId, seq) { it.copy(checked = true) }
            is ListChange.UncheckItem -> updateItem(change.itemId, seq) { it.copy(checked = false) }
            is ListChange.DeleteItem -> updateItem(change.itemId, seq) { it.copy(deleted = true) }
            is ListChange.RemoveChecked -> copy(
                items = items.map { if (it.isActive && it.checked) it.copy(deleted = true, seq = seq) else it },
            )
        }
    }

    fun markDeleted(seq: Long): ShoppingList = copy(deleted = true, seq = seq)

    private fun addItem(change: ListChange.AddItem, seq: Long, now: Instant): ShoppingList {
        if (item(change.itemId) != null) {
            throw DomainException(ErrorKind.CONFLICT, "ITEM_EXISTS", "Item ${change.itemId.value} already exists")
        }
        val item = Item(
            id = change.itemId,
            name = normalizeItemName(change.name),
            quantity = normalizeOptional(change.quantity, ItemField.QUANTITY),
            unit = normalizeOptional(change.unit, ItemField.UNIT),
            note = normalizeOptional(change.note, ItemField.NOTE),
            categoryId = change.categoryId,
            createdAt = now,
            seq = seq,
        )
        if (activeItems.size >= MAX_ITEMS) {
            throw DomainException(ErrorKind.VALIDATION, "LIST_FULL", "A list can hold at most $MAX_ITEMS items")
        }
        return copy(items = items + item)
    }

    private fun updateItem(itemId: ItemId, seq: Long, change: (Item) -> Item): ShoppingList {
        val existing = item(itemId)
        if (existing == null || existing.deleted) {
            throw DomainException(ErrorKind.NOT_FOUND, "ITEM_NOT_FOUND", "No item ${itemId.value}")
        }
        return copy(items = items.map { if (it.id == itemId) change(it).copy(seq = seq) else it })
    }

    private fun edit(item: Item, field: ItemField, value: String?): Item = when (field) {
        ItemField.NAME -> item.copy(name = normalizeItemName(value ?: ""))
        ItemField.QUANTITY -> item.copy(quantity = normalizeOptional(value, field))
        ItemField.UNIT -> item.copy(unit = normalizeOptional(value, field))
        ItemField.NOTE -> item.copy(note = normalizeOptional(value, field))
        ItemField.CATEGORY -> item.copy(categoryId = value?.takeIf { it.isNotBlank() }?.let(::CategoryId))
    }

    companion object {
        const val MAX_NAME_LENGTH = 60
        const val MAX_ITEM_NAME_LENGTH = 100
        const val MAX_ITEMS = 1000

        fun create(id: ListId, spaceId: SpaceId, name: String, seq: Long, now: Instant) =
            ShoppingList(id, spaceId, name.trim(), emptyList(), now, seq)

        fun listNotFound() = DomainException(ErrorKind.NOT_FOUND, "LIST_NOT_FOUND", "List not found")

        private fun validateName(name: String, code: String) {
            if (name.isBlank() || name != name.trim() || name.length > MAX_NAME_LENGTH) {
                throw DomainException(ErrorKind.VALIDATION, code, "Name must be 1-$MAX_NAME_LENGTH characters")
            }
        }

        fun normalizeItemName(name: String): String {
            val trimmed = name.trim()
            if (trimmed.isEmpty() || trimmed.length > MAX_ITEM_NAME_LENGTH) {
                throw DomainException(ErrorKind.VALIDATION, "INVALID_ITEM_NAME", "Item name must be 1-$MAX_ITEM_NAME_LENGTH characters")
            }
            return trimmed
        }

        /** Optional text fields: blank means "not set"; each has a length limit. */
        private fun normalizeOptional(value: String?, field: ItemField): String? {
            val trimmed = value?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            if (trimmed.length > field.maxLength) {
                throw DomainException(ErrorKind.VALIDATION, "INVALID_ITEM_FIELD", "${field.name} is too long (max ${field.maxLength})")
            }
            return trimmed
        }
    }
}

enum class ItemField(val maxLength: Int) {
    NAME(ShoppingList.MAX_ITEM_NAME_LENGTH),
    QUANTITY(20),
    UNIT(20),
    NOTE(200),
    CATEGORY(64),
}

/** The fine-grained changes a client can make to a list (see `doc/features.md` 3.5). */
sealed interface ListChange {
    data class RenameList(val name: String) : ListChange
    data class AddItem(
        val itemId: ItemId,
        val name: String,
        val quantity: String? = null,
        val unit: String? = null,
        val note: String? = null,
        val categoryId: CategoryId? = null,
    ) : ListChange

    /** Sets one field; `null`/blank clears optional fields. One change per field, so edits merge field by field. */
    data class EditItem(val itemId: ItemId, val field: ItemField, val value: String?) : ListChange
    data class CheckItem(val itemId: ItemId) : ListChange
    data class UncheckItem(val itemId: ItemId) : ListChange
    data class DeleteItem(val itemId: ItemId) : ListChange
    data object RemoveChecked : ListChange
}
