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
 */
@ApplicationScoped
class ListStore(
    private val lists: ShoppingListRepository,
    private val syncStates: SyncStateRepository,
    private val clock: Clock,
) {
    fun save(list: ShoppingList) {
        val (cleaned, purgedSeq) = list.purgeTombstones(clock.instant().minus(TOMBSTONE_RETENTION))
        lists.save(cleaned)
        if (purgedSeq > 0) {
            syncStates.save(syncStates.find(list.spaceId).withPurged(purgedSeq))
        }
    }

    companion object {
        val TOMBSTONE_RETENTION: Duration = Duration.ofDays(30)
    }
}
