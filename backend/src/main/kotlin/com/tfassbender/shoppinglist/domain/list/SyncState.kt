package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.space.SpaceId
import java.time.Instant

/**
 * Sync bookkeeping of a space:
 * - [appliedChanges]: change ids already processed (with time) – a resent batch is applied only once,
 * - [purgedSeq]: highest sequence number of a dropped tombstone – clients that synced before it must do a
 *   full resync, because they would miss that deletion.
 */
data class SyncState(
    val spaceId: SpaceId,
    val purgedSeq: Long = 0,
    val appliedChanges: Map<String, Instant> = emptyMap(),
) {
    fun isApplied(changeId: String): Boolean = changeId in appliedChanges

    fun remember(changeId: String, now: Instant): SyncState = copy(appliedChanges = appliedChanges + (changeId to now))

    /** Forgets change ids older than [cutoff] and keeps at most [MAX_REMEMBERED] (newest). */
    fun prune(cutoff: Instant): SyncState {
        val recent = appliedChanges.filterValues { !it.isBefore(cutoff) }
        val capped = if (recent.size <= MAX_REMEMBERED) recent else recent.entries.sortedByDescending { it.value }.take(MAX_REMEMBERED).associate { it.key to it.value }
        return copy(appliedChanges = capped)
    }

    fun withPurged(seq: Long): SyncState = if (seq > purgedSeq) copy(purgedSeq = seq) else this

    /** True if a client that last synced at [since] must reload everything. */
    fun needsFullResync(since: Long, currentSeq: Long): Boolean = since <= 0 || since < purgedSeq || since > currentSeq

    companion object {
        const val MAX_REMEMBERED = 10_000
    }
}
