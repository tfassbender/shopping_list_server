package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.user.UserId
import java.time.Instant

/** What was changed last: the space sequence number of the change and who made it. */
data class Stamp(val seq: Long, val by: UserId?)

/** The parts of an item whose changes are tracked separately, so changes merge field by field. */
enum class ItemAspect { EXISTENCE, NAME, QUANTITY, UNIT, NOTE, CATEGORY, CHECKED }

/**
 * Context of applying a change: its sequence number, time and author. [baseSeq] is the space sequence
 * number the author's client had seen when it made the change (offline sync); null for online calls,
 * which have no conflict detection (simply "later wins").
 */
data class ChangeContext(
    val seq: Long,
    val now: Instant,
    val userId: UserId? = null,
    val baseSeq: Long? = null,
) {
    /** True if [stamp] is a change by someone else that the author's client didn't know yet. */
    fun isConcurrentForeign(stamp: Stamp?): Boolean =
        baseSeq != null && stamp != null && stamp.seq > baseSeq && stamp.by != userId
}

/**
 * Something the merge did that the author should know about (shown behind the warning icon).
 * Values are raw: category ids, "true"/"false" for CHECKED – clients render them.
 */
sealed interface MergeWarning {
    val listId: ListId

    /** The author's change replaced a value someone else had set in the meantime. [itemId] null = list name. */
    data class Overwritten(
        override val listId: ListId,
        val itemId: ItemId?,
        val itemName: String,
        val aspect: ItemAspect,
        val theirValue: String?,
        val yourValue: String?,
        val by: UserId?,
    ) : MergeWarning

    /** The author changed an item someone else had deleted: edit wins, the item is back. */
    data class Restored(override val listId: ListId, val itemId: ItemId, val itemName: String, val deletedBy: UserId?) : MergeWarning

    /** The author deleted an item someone else had changed in the meantime: edit wins, the item stays. */
    data class DeleteSkipped(override val listId: ListId, val itemId: ItemId, val itemName: String, val changedBy: UserId?) : MergeWarning

    /** The author's change could not be applied because the list was deleted. */
    data class ListGone(override val listId: ListId, val listName: String?) : MergeWarning
}

data class ApplyResult(val list: ShoppingList, val warnings: List<MergeWarning> = emptyList())
