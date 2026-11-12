package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.time.Duration

/**
 * Saves lists and drops old tombstones on the way (deleted items older than [TOMBSTONE_RETENTION]).
 * When tombstones are dropped, the space's purge horizon moves, so clients that synced before it do a
 * full resync. Callers hold the space lock.
 *
 * [save] records the horizon itself; [saveWithoutPurgeRecord] leaves that to the caller, which saves the
 * sync state afterwards anyway (the sync push).
 */
@ApplicationScoped
class ListStore(
    private val lists: ShoppingListRepository,
    private val syncStates: SyncStateRepository,
    private val clock: Clock,
) {
    fun save(list: ShoppingList) {
        val purgedSeq = saveWithoutPurgeRecord(list)
        if (purgedSeq > 0) {
            syncStates.save(syncStates.find(list.spaceId).withPurged(purgedSeq))
        }
    }

    /** Saves the list; returns the highest seq of a dropped tombstone (0 = none) for the sync state. */
    fun saveWithoutPurgeRecord(list: ShoppingList): Long {
        val (cleaned, purgedSeq) = list.purgeTombstones(clock.instant().minus(TOMBSTONE_RETENTION))
        lists.save(cleaned)
        return purgedSeq
    }

    companion object {
        val TOMBSTONE_RETENTION: Duration = Duration.ofDays(30)
    }
}
