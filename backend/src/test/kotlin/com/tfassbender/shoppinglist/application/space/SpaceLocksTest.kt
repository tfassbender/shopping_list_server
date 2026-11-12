package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.port.SpaceChangeNotifier
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class SpaceLocksTest {

    private val notified = mutableListOf<SpaceId>()
    private val locks = SpaceLocks(object : SpaceChangeNotifier {
        override fun spaceChanged(spaceId: SpaceId) {
            notified += spaceId
        }

        override fun accessLost(spaceId: SpaceId, userIds: Collection<UserId>) {}
    })
    private val space = SpaceId("s")

    @Test
    fun `notifies once after the outermost lock of a successful change`() {
        val result = locks.withLock(space) {
            locks.withLock(space) { "inner" }
            assertEquals(emptyList(), notified) // not yet: still inside the outer lock
            "outer"
        }
        assertEquals("outer", result)
        assertEquals(listOf(space), notified)
    }

    @Test
    fun `reads under the lock are not announced`() {
        assertEquals("read", locks.read(space) { "read" })
        assertEquals(emptyList(), notified)
    }

    @Test
    fun `failed changes are not announced`() {
        assertThrows<IllegalStateException> { locks.withLock(space) { error("rejected") } }
        assertEquals(emptyList(), notified)
    }

    @Test
    fun `each space is announced separately`() {
        locks.withLock(SpaceId("a")) { locks.withLock(SpaceId("b")) {} }
        assertEquals(listOf(SpaceId("b"), SpaceId("a")), notified)
    }
}
