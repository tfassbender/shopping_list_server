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

internal fun requireClientId(value: String, kind: String) {
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
 * [deleted] marks a tombstone that is kept so other clients learn about the deletion. [stamps] record
 * who changed which aspect last – the basis of the merge rules.
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
    val stamps: Map<ItemAspect, Stamp> = emptyMap(),
    val deletedAt: Instant? = null,
) {
    val isActive: Boolean get() = !deleted

    /** The value of an aspect as text, for comparisons and merge warnings. */
    fun valueOf(aspect: ItemAspect): String? = when (aspect) {
        ItemAspect.EXISTENCE -> if (deleted) "deleted" else "exists"
        ItemAspect.NAME -> name
        ItemAspect.QUANTITY -> quantity
        ItemAspect.UNIT -> unit
        ItemAspect.NOTE -> note
        ItemAspect.CATEGORY -> categoryId?.value
        ItemAspect.CHECKED -> checked.toString()
    }

    internal fun stamped(aspect: ItemAspect, context: ChangeContext): Item =
        copy(seq = context.seq, stamps = stamps + (aspect to Stamp(context.seq, context.userId)))
}

/**
 * A shopping list with its items. All mutations go through [apply] with a [ListChange] – the same
 * change objects the offline sync sends in batches – so online REST calls, sync and AI agents share one
 * implementation, including the merge rules (`doc/features.md` 3.5):
 * - same field changed concurrently → the later applied change wins ([MergeWarning.Overwritten]),
 * - edit/check/uncheck of a deleted item → the item is restored ([MergeWarning.Restored]),
 * - delete of an item someone else changed concurrently → the item stays ([MergeWarning.DeleteSkipped]).
 * "Concurrently" means: after the author's [ChangeContext.baseSeq], by another user.
 */
data class ShoppingList(
    val id: ListId,
    val spaceId: SpaceId,
    val name: String,
    val items: List<Item>,
    val createdAt: Instant,
    val seq: Long,
    val deleted: Boolean = false,
    val nameStamp: Stamp? = null,
    val deletedAt: Instant? = null,
) {
    init {
        validateName(name, "INVALID_NAME")
    }

    val activeItems: List<Item> get() = items.filter { it.isActive }

    fun item(itemId: ItemId): Item? = items.firstOrNull { it.id == itemId }

    /** Online convenience without author/conflict detection (tests, simple callers). */
    fun apply(change: ListChange, seq: Long, now: Instant): ShoppingList = apply(change, ChangeContext(seq, now)).list

    fun apply(change: ListChange, context: ChangeContext): ApplyResult {
        if (deleted) throw listNotFound()
        return when (change) {
            is ListChange.RenameList -> rename(change.name, context)
            is ListChange.AddItem -> ApplyResult(addItem(change, context))
            is ListChange.EditItem -> changeAspect(change.itemId, change.field.aspect, context) { edit(it, change.field, change.value) }
            is ListChange.CheckItem -> changeAspect(change.itemId, ItemAspect.CHECKED, context) { it.copy(checked = true) }
            is ListChange.UncheckItem -> changeAspect(change.itemId, ItemAspect.CHECKED, context) { it.copy(checked = false) }
            is ListChange.DeleteItem -> deleteItem(change.itemId, context, failIfUnknown = true)
            is ListChange.RemoveChecked -> removeChecked(change.itemIds, context)
        }
    }

    fun markDeleted(seq: Long, now: Instant): ShoppingList = copy(deleted = true, seq = seq, deletedAt = now)

    /**
     * Drops tombstones deleted before [cutoff] (they have reached every client by then). Returns the list
     * and the highest sequence number dropped (0 if none) – clients behind that need a full resync.
     */
    fun purgeTombstones(cutoff: Instant): Pair<ShoppingList, Long> {
        val (old, kept) = items.partition { it.deleted && it.deletedAt != null && it.deletedAt.isBefore(cutoff) }
        return copy(items = kept) to (old.maxOfOrNull { it.seq } ?: 0)
    }

    private fun rename(newName: String, context: ChangeContext): ApplyResult {
        val renamed = copy(name = newName.trim(), seq = context.seq, nameStamp = Stamp(context.seq, context.userId))
        val warnings = if (renamed.name != name && context.isConcurrentForeign(nameStamp)) {
            listOf(MergeWarning.Overwritten(id, null, name, ItemAspect.NAME, name, renamed.name, nameStamp?.by))
        } else {
            emptyList()
        }
        return ApplyResult(renamed, warnings)
    }

    private fun addItem(change: ListChange.AddItem, context: ChangeContext): ShoppingList {
        if (item(change.itemId) != null) {
            throw DomainException(ErrorKind.CONFLICT, "ITEM_EXISTS", "Item ${change.itemId.value} already exists")
        }
        if (activeItems.size >= MAX_ITEMS) {
            throw DomainException(ErrorKind.VALIDATION, "LIST_FULL", "A list can hold at most $MAX_ITEMS items")
        }
        val item = Item(
            id = change.itemId,
            name = normalizeItemName(change.name),
            quantity = normalizeOptional(change.quantity, ItemField.QUANTITY),
            unit = normalizeOptional(change.unit, ItemField.UNIT),
            note = normalizeOptional(change.note, ItemField.NOTE),
            categoryId = change.categoryId,
            createdAt = nextCreatedAt(context.now),
            seq = context.seq,
        ).stamped(ItemAspect.EXISTENCE, context)
        return copy(items = items + item)
    }

    /**
     * Items of one sync batch are added at the same instant, but "order of adding" sorts by [Item.createdAt]:
     * each new item gets at least 1 ms more than the newest one, so the order stays unambiguous everywhere.
     */
    private fun nextCreatedAt(now: Instant): Instant {
        val newest = items.maxOfOrNull { it.createdAt } ?: return now
        return maxOf(now, newest.plusMillis(1))
    }

    /** Edit, check and uncheck: restores a deleted item (edit wins over delete), later change wins. */
    private fun changeAspect(itemId: ItemId, aspect: ItemAspect, context: ChangeContext, update: (Item) -> Item): ApplyResult {
        val existing = item(itemId) ?: throw itemNotFound(itemId)
        val warnings = mutableListOf<MergeWarning>()
        var item = existing
        if (item.deleted) {
            val deletion = item.stamps[ItemAspect.EXISTENCE]
            if (deletion == null || deletion.by != context.userId) {
                warnings += MergeWarning.Restored(id, itemId, item.name, deletion?.by)
            }
            item = item.copy(deleted = false, deletedAt = null).stamped(ItemAspect.EXISTENCE, context)
        }
        val updated = update(item)
        val previous = existing.stamps[aspect]
        if (existing.valueOf(aspect) != updated.valueOf(aspect) && context.isConcurrentForeign(previous)) {
            warnings += MergeWarning.Overwritten(id, itemId, updated.name, aspect, existing.valueOf(aspect), updated.valueOf(aspect), previous?.by)
        }
        return ApplyResult(replace(updated.stamped(aspect, context)), warnings)
    }

    /** Delete: skipped if someone else changed the item concurrently (edit wins); idempotent. */
    private fun deleteItem(itemId: ItemId, context: ChangeContext, failIfUnknown: Boolean): ApplyResult {
        val existing = item(itemId) ?: if (failIfUnknown) throw itemNotFound(itemId) else return ApplyResult(this)
        if (existing.deleted) return ApplyResult(this)
        val foreignChange = existing.stamps.values.filter { context.isConcurrentForeign(it) }.maxByOrNull { it.seq }
        if (foreignChange != null) {
            return ApplyResult(this, listOf(MergeWarning.DeleteSkipped(id, itemId, existing.name, foreignChange.by)))
        }
        val tombstone = existing.copy(deleted = true, deletedAt = context.now).stamped(ItemAspect.EXISTENCE, context)
        return ApplyResult(replace(tombstone))
    }

    /** [itemIds]: the items the author saw checked (offline); null = all items checked right now. */
    private fun removeChecked(itemIds: Set<ItemId>?, context: ChangeContext): ApplyResult {
        val targets = itemIds?.toList() ?: activeItems.filter { it.checked }.map { it.id }
        return targets.fold(ApplyResult(this)) { result, itemId ->
            val next = result.list.deleteItem(itemId, context, failIfUnknown = false)
            ApplyResult(next.list, result.warnings + next.warnings)
        }
    }

    private fun replace(item: Item): ShoppingList = copy(items = items.map { if (it.id == item.id) item else it })

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

        private fun itemNotFound(itemId: ItemId) = DomainException(ErrorKind.NOT_FOUND, "ITEM_NOT_FOUND", "No item ${itemId.value}")

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

enum class ItemField(val maxLength: Int, val aspect: ItemAspect) {
    NAME(ShoppingList.MAX_ITEM_NAME_LENGTH, ItemAspect.NAME),
    QUANTITY(20, ItemAspect.QUANTITY),
    UNIT(20, ItemAspect.UNIT),
    NOTE(200, ItemAspect.NOTE),
    CATEGORY(64, ItemAspect.CATEGORY),
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

    /** Deletes checked items: [itemIds] as the author saw them checked (offline), or null = all checked now. */
    data class RemoveChecked(val itemIds: Set<ItemId>? = null) : ListChange
}
