package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.space.SpaceId
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class SyncStateTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val state = SyncState(SpaceId("s"))

    @Test
    fun `remembers change ids and forgets old ones`() {
        val remembered = state.remember("a", t0).remember("b", t0.plus(Duration.ofDays(20)))
        assertTrue(remembered.isApplied("a"))
        val pruned = remembered.prune(t0.plus(Duration.ofDays(10)))
        assertFalse(pruned.isApplied("a"))
        assertTrue(pruned.isApplied("b"))
    }

    @Test
    fun `keeps at most the newest change ids`() {
        val many = (1..SyncState.MAX_REMEMBERED + 5).fold(state) { s, i -> s.remember("c$i", t0.plusSeconds(i.toLong())) }
        val pruned = many.prune(t0)
        assertEquals(SyncState.MAX_REMEMBERED, pruned.appliedChanges.size)
        assertFalse(pruned.isApplied("c1"))
        assertTrue(pruned.isApplied("c${SyncState.MAX_REMEMBERED + 5}"))
    }

    @Test
    fun `purge horizon only moves forward`() {
        assertEquals(7, state.withPurged(7).withPurged(3).purgedSeq)
    }

    @Test
    fun `full resync is needed for first sync, too old or future base`() {
        val purged = state.withPurged(10)
        assertTrue(purged.needsFullResync(0, 20))
        assertTrue(purged.needsFullResync(9, 20))
        assertFalse(purged.needsFullResync(10, 20))
        assertFalse(purged.needsFullResync(20, 20))
        assertTrue(purged.needsFullResync(21, 20)) // client is ahead - server data was reset
    }
}
