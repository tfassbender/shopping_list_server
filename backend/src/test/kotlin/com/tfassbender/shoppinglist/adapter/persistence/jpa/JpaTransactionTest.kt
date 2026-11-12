package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import io.quarkus.test.junit.QuarkusTest
import jakarta.inject.Inject
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.junit.jupiter.api.Assumptions.assumeTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.test.assertNull

/** A `SpaceLocks` operation is one transaction: all of its writes commit together or not at all. */
@QuarkusTest
class JpaTransactionTest {

    @Inject lateinit var locks: SpaceLocks
    @Inject lateinit var spaces: SpaceRepository
    @Inject lateinit var lists: ShoppingListRepository
    @Inject lateinit var sequence: SequenceCounter

    @ConfigProperty(name = "shoppinglist.storage")
    lateinit var storage: String

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val space = Space.create(SpaceId("tx-${UUID.randomUUID()}"), "Home", UserId("owner"), t0)

    @BeforeEach
    fun setUp() {
        assumeTrue(storage == "postgres", "runs only with shoppinglist.storage=postgres")
        spaces.save(space)
    }

    @Test
    fun `a failing locked operation rolls back every write`() {
        assertThrows<IllegalStateException> {
            locks.withLock(space.id) {
                val seq = sequence.next(space.id)
                lists.save(ShoppingList.create(ListId("l1"), space.id, "Groceries", seq, t0))
                spaces.save(space.rename("Renamed"))
                error("boom")
            }
        }

        assertEquals(0, sequence.current(space.id))
        assertNull(lists.findById(space.id, ListId("l1")))
        assertEquals("Home", spaces.findById(space.id)?.name)
    }

    @Test
    fun `a successful locked operation commits all writes, nested locks included`() {
        locks.withLock(space.id) {
            val seq = sequence.next(space.id)
            lists.save(ShoppingList.create(ListId("l1"), space.id, "Groceries", seq, t0))
            locks.withLock(space.id) { spaces.save(space.rename("Renamed")) }
        }

        assertEquals(1, sequence.current(space.id))
        assertNotNull(lists.findById(space.id, ListId("l1")))
        assertEquals("Renamed", spaces.findById(space.id)?.name)
    }
}
