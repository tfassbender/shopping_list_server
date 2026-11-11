package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.InMemoryListRepository
import com.tfassbender.shoppinglist.application.InMemorySequenceCounter
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.ItemField
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ShoppingListServiceTest {

    private val clock = MutableClock()
    private val spaces = InMemorySpaceRepository()
    private val lists = InMemoryListRepository()
    private val sequence = InMemorySequenceCounter()
    private val service = ShoppingListService(lists, sequence, SpaceAccess(spaces), SpaceLocks(), clock)

    private val owner = UserId("owner")
    private val member = UserId("member")
    private val stranger = UserId("stranger")
    private val spaceId = SpaceId("s1")

    init {
        val now = clock.instant()
        spaces.save(
            Space.create(spaceId, "Home", owner, now)
                .addInvite(Invite(InviteId("i"), "h", owner, now, now.plusSeconds(60)))
                .acceptInvite("h", member, now),
        )
    }

    @Test
    fun `members create lists, every change gets a new space seq`() {
        val list = service.create(member, spaceId, "Groceries")
        assertEquals(1, list.seq)

        val updated = service.apply(member, spaceId, list.id, ListChange.AddItem(ItemId("milk"), "Milk"))
        assertEquals(2, updated.item(ItemId("milk"))!!.seq)
        assertEquals(2, sequence.current(spaceId))
    }

    @Test
    fun `client generated list id is used and must be unique`() {
        val list = service.create(owner, spaceId, "A", ListId("client-uuid"))
        assertEquals(ListId("client-uuid"), list.id)
        assertEquals("LIST_EXISTS", assertThrows<DomainException> { service.create(owner, spaceId, "B", ListId("client-uuid")) }.code)
    }

    @Test
    fun `strangers can't see or change lists`() {
        val list = service.create(owner, spaceId, "Groceries")
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.lists(stranger, spaceId) }.code)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.get(stranger, spaceId, list.id) }.code)
        assertThrows<DomainException> { service.apply(stranger, spaceId, list.id, ListChange.RemoveChecked) }
        assertThrows<DomainException> { service.create(stranger, spaceId, "X") }
    }

    @Test
    fun `only the owner deletes lists, deleted lists disappear`() {
        val list = service.create(member, spaceId, "Groceries")
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.delete(member, spaceId, list.id) }.code)

        service.delete(owner, spaceId, list.id)

        assertTrue(service.lists(member, spaceId).isEmpty())
        assertEquals("LIST_NOT_FOUND", assertThrows<DomainException> { service.get(member, spaceId, list.id) }.code)
        assertTrue(lists.findById(spaceId, list.id)!!.deleted) // kept as tombstone
    }

    @Test
    fun `a batch of changes is atomic`() {
        val list = service.create(member, spaceId, "Groceries")
        service.apply(member, spaceId, list.id, ListChange.AddItem(ItemId("milk"), "Milk"))

        assertThrows<DomainException> {
            service.applyChanges(
                member, spaceId, list.id,
                listOf(ListChange.EditItem(ItemId("milk"), ItemField.QUANTITY, "2"), ListChange.CheckItem(ItemId("missing"))),
            )
        }
        assertEquals(null, service.get(member, spaceId, list.id).item(ItemId("milk"))!!.quantity)
    }

    @Test
    fun `lists of other spaces are not reachable via a foreign space id`() {
        val otherSpace = SpaceId("s2")
        spaces.save(Space.create(otherSpace, "Other", stranger, clock.instant()))
        val foreignList = service.create(stranger, otherSpace, "Secret")
        assertEquals("LIST_NOT_FOUND", assertThrows<DomainException> { service.get(member, spaceId, foreignList.id) }.code)
    }

    @Test
    fun `concurrent changes on one space are serialized - no lost updates`() {
        val list = service.create(member, spaceId, "Groceries")
        val pool = Executors.newFixedThreadPool(8)
        repeat(100) { i ->
            pool.submit { service.apply(if (i % 2 == 0) owner else member, spaceId, list.id, ListChange.AddItem(ItemId("i$i"), "Item $i")) }
        }
        pool.shutdown()
        pool.awaitTermination(30, TimeUnit.SECONDS)

        val result = service.get(owner, spaceId, list.id)
        assertEquals(100, result.activeItems.size)
        assertEquals(100, result.items.map { it.seq }.toSet().size) // every change got its own seq
    }
}
