package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.InMemoryCatalogRepository
import com.tfassbender.shoppinglist.application.InMemoryFavoritesRepository
import com.tfassbender.shoppinglist.application.InMemoryLayoutRepository
import com.tfassbender.shoppinglist.application.InMemoryListRepository
import com.tfassbender.shoppinglist.application.InMemorySequenceCounter
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.InMemorySyncStateRepository
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.space.CatalogService
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.ItemField
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.MergeWarning
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Duration
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SyncServiceTest {

    private val clock = MutableClock()
    private val spaces = InMemorySpaceRepository()
    private val users = InMemoryUserRepository()
    private val listRepo = InMemoryListRepository()
    private val catalogs = InMemoryCatalogRepository()
    private val layoutRepo = InMemoryLayoutRepository()
    private val syncStates = InMemorySyncStateRepository()
    private val sequence = InMemorySequenceCounter()
    private val locks = SpaceLocks()
    private val access = SpaceAccess(spaces)
    private val store = ListStore(listRepo, syncStates, clock)
    private val catalog = CatalogService(catalogs, sequence, access, locks, clock)
    private val lists = ShoppingListService(listRepo, store, sequence, access, locks, clock, catalog)
    private val layouts = LayoutService(layoutRepo, InMemoryFavoritesRepository(), catalogs, listRepo, users, sequence, access, locks, clock)
    private val sync = SyncService(listRepo, store, syncStates, sequence, catalogs, layoutRepo, users, catalog, access, locks, clock)

    private val anna = UserId("anna")
    private val bob = UserId("bob")
    private val spaceId = SpaceId("s")
    private val listId = ListId("groceries")
    private val milk = ItemId("milk")

    init {
        val now = clock.instant()
        users.save(User(anna, Email.of("anna@example.com"), "Anna", "h", true, now))
        users.save(User(bob, Email.of("bob@example.com"), "Bob", "h", true, now))
        spaces.save(Space.create(spaceId, "Home", anna, now).addInvite(Invite(InviteId("i"), "h", anna, now, now.plusSeconds(60))).acceptInvite("h", bob, now))
        catalog.createDefaults(spaceId, Language.EN)
        lists.create(anna, spaceId, "Groceries", listId)
        lists.apply(anna, spaceId, listId, ListChange.AddItem(milk, "Milk", "1"))
    }

    private var changeCounter = 0
    private fun change(change: ListChange, id: String = "c${changeCounter++}") = SyncOperation.ChangeList(id, listId, change)
    private fun current() = sequence.current(spaceId)

    @Nested
    inner class Push {
        @Test
        fun `a batch is applied in order with one new seq`() {
            val before = current()
            val result = sync.push(bob, spaceId, before, listOf(
                change(ListChange.AddItem(ItemId("bread"), "Bread")),
                change(ListChange.EditItem(ItemId("bread"), ItemField.QUANTITY, "2")),
                change(ListChange.CheckItem(milk)),
            ))

            assertEquals(before + 1, result.seq)
            assertTrue(result.results.all { it.status == ChangeStatus.APPLIED })
            val list = lists.get(anna, spaceId, listId)
            assertEquals("2", list.item(ItemId("bread"))!!.quantity)
            assertTrue(list.item(milk)!!.checked)
            assertEquals(setOf(result.seq), list.items.filter { it.id.value == "bread" }.map { it.seq }.toSet())
        }

        @Test
        fun `resending a batch is idempotent`() {
            val batch = listOf(change(ListChange.AddItem(ItemId("bread"), "Bread"), "add-bread"), change(ListChange.EditItem(milk, ItemField.QUANTITY, "5"), "qty"))
            sync.push(bob, spaceId, current(), batch)
            // Connection lost before the answer arrived - the client sends the same batch again:
            val second = sync.push(bob, spaceId, current(), batch)

            assertEquals(listOf(ChangeStatus.DUPLICATE, ChangeStatus.DUPLICATE), second.results.map { it.status })
            assertEquals(2, lists.get(anna, spaceId, listId).activeItems.size)
        }

        @Test
        fun `a partly applied batch resent with more changes applies only the new ones`() {
            sync.push(bob, spaceId, current(), listOf(change(ListChange.AddItem(ItemId("a"), "A"), "1")))
            val result = sync.push(bob, spaceId, current(), listOf(
                change(ListChange.AddItem(ItemId("a"), "A"), "1"),
                change(ListChange.AddItem(ItemId("b"), "B"), "2"),
            ))
            assertEquals(listOf(ChangeStatus.DUPLICATE, ChangeStatus.APPLIED), result.results.map { it.status })
        }

        @Test
        fun `a rejected change does not block the rest of the batch`() {
            val result = sync.push(bob, spaceId, current(), listOf(
                change(ListChange.EditItem(ItemId("ghost"), ItemField.NOTE, "x")),
                change(ListChange.AddItem(ItemId("bread"), " ")),
                change(ListChange.CheckItem(milk)),
            ))
            assertEquals(listOf(ChangeStatus.REJECTED, ChangeStatus.REJECTED, ChangeStatus.APPLIED), result.results.map { it.status })
            assertEquals(listOf("ITEM_NOT_FOUND", "INVALID_ITEM_NAME", null), result.results.map { it.code })
            assertTrue(lists.get(anna, spaceId, listId).item(milk)!!.checked)
        }

        @Test
        fun `changes to a list the owner deleted are rejected with a warning`() {
            val base = current()
            lists.delete(anna, spaceId, listId)
            val result = sync.push(bob, spaceId, base, listOf(change(ListChange.CheckItem(milk))))

            assertEquals(ChangeStatus.REJECTED, result.results.single().status)
            assertEquals("LIST_NOT_FOUND", result.results.single().code)
            val warning = result.warnings.single()
            assertEquals(MergeWarning.ListGone(listId, "Groceries"), warning.warning)
        }

        @Test
        fun `lists created offline can be filled in the same batch`() {
            val newList = ListId("offline-list")
            val result = sync.push(bob, spaceId, current(), listOf(
                SyncOperation.CreateList("create", newList, "Hardware"),
                SyncOperation.ChangeList("add", newList, ListChange.AddItem(ItemId("nails"), "Nails")),
            ))
            assertTrue(result.results.all { it.status == ChangeStatus.APPLIED })
            assertEquals(listOf("Nails"), lists.get(anna, spaceId, newList).activeItems.map { it.name })
        }

        @Test
        fun `creating an existing list id with a new change id is rejected`() {
            val result = sync.push(bob, spaceId, current(), listOf(SyncOperation.CreateList("x", listId, "Again")))
            assertEquals("LIST_EXISTS", result.results.single().code)
        }

        @Test
        fun `merge warnings carry list and display names`() {
            val base = current()
            lists.apply(anna, spaceId, listId, ListChange.EditItem(milk, ItemField.QUANTITY, "3"))
            val result = sync.push(bob, spaceId, base, listOf(change(ListChange.EditItem(milk, ItemField.QUANTITY, "2"))))

            val view = result.warnings.single()
            assertEquals("Anna", view.byName)
            assertEquals("Groceries", view.listName)
            assertEquals("3", (view.warning as MergeWarning.Overwritten).theirValue)
        }

        @Test
        fun `offline additions get their category from the item history`() {
            lists.apply(anna, spaceId, listId, ListChange.EditItem(milk, ItemField.CATEGORY, "dairy"))
            sync.push(bob, spaceId, current(), listOf(change(ListChange.AddItem(ItemId("milk2"), "milk"))))
            assertEquals("dairy", lists.get(anna, spaceId, listId).item(ItemId("milk2"))!!.categoryId?.value)
        }

        @Test
        fun `strangers can't push and batches are limited`() {
            assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { sync.push(UserId("x"), spaceId, 0, emptyList()) }.code)
            val tooMany = (0..SyncService.MAX_BATCH).map { change(ListChange.CheckItem(milk)) }
            assertEquals("BATCH_TOO_LARGE", assertThrows<DomainException> { sync.push(bob, spaceId, 0, tooMany) }.code)
        }

        @Test
        fun `concurrent pushes of two users don't lose changes`() {
            val pool = Executors.newFixedThreadPool(8)
            repeat(40) { i ->
                pool.submit {
                    val user = if (i % 2 == 0) anna else bob
                    sync.push(user, spaceId, 0, listOf(SyncOperation.ChangeList("p$i", listId, ListChange.AddItem(ItemId("i$i"), "Item $i"))))
                }
            }
            pool.shutdown()
            pool.awaitTermination(30, TimeUnit.SECONDS)
            assertEquals(41, lists.get(anna, spaceId, listId).activeItems.size)
        }
    }

    @Nested
    inner class Pull {
        @Test
        fun `first pull (since 0) returns the full state`() {
            val result = sync.pull(bob, spaceId, 0)
            assertTrue(result.fullResync)
            assertEquals(current(), result.seq)
            assertEquals(listOf("Milk"), result.lists.single().items.map { it.name })
            assertNotNull(result.catalog)
        }

        @Test
        fun `returns only what changed since, including tombstones`() {
            lists.apply(anna, spaceId, listId, ListChange.AddItem(ItemId("bread"), "Bread"))
            val since = current()
            lists.apply(anna, spaceId, listId, ListChange.DeleteItem(ItemId("bread")))
            lists.apply(anna, spaceId, listId, ListChange.AddItem(ItemId("eggs"), "Eggs"))

            val result = sync.pull(bob, spaceId, since)

            assertFalse(result.fullResync)
            val items = result.lists.single().items
            assertEquals(listOf("bread" to true, "eggs" to false), items.map { it.id.value to it.deleted })
            assertNull(result.catalog) // unchanged
            assertNull(result.layouts)
        }

        @Test
        fun `nothing changed - nothing returned`() {
            val result = sync.pull(bob, spaceId, current())
            assertTrue(result.lists.isEmpty())
            assertEquals(listOf(listId), result.listIds)
        }

        @Test
        fun `deleted lists show up as deleted and vanish from listIds`() {
            val since = current()
            lists.delete(anna, spaceId, listId)
            val result = sync.pull(bob, spaceId, since)
            assertTrue(result.lists.single().deleted)
            assertTrue(result.listIds.isEmpty())
        }

        @Test
        fun `catalog and layouts are included when they changed`() {
            val since = current()
            catalog.setUnits(anna, spaceId, listOf("pcs"))
            layouts.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
            val result = sync.pull(bob, spaceId, since)
            assertEquals(listOf("pcs"), result.catalog!!.units)
            assertEquals(listOf("Aldi"), result.layouts!!.map { it.name })
        }

        @Test
        fun `a pull after an old tombstone was purged needs a full resync`() {
            lists.apply(anna, spaceId, listId, ListChange.AddItem(ItemId("bread"), "Bread"))
            lists.apply(anna, spaceId, listId, ListChange.DeleteItem(ItemId("bread")))
            val oldSince = current() - 1 // a client that hasn't seen the deletion
            clock.advance(Duration.ofDays(31))
            lists.apply(anna, spaceId, listId, ListChange.CheckItem(milk)) // saving purges the old tombstone

            assertNull(listRepo.findById(spaceId, listId)!!.item(ItemId("bread")))
            val result = sync.pull(bob, spaceId, oldSince)
            assertTrue(result.fullResync)
            assertEquals(listOf("Milk"), result.lists.single().items.map { it.name })
            assertFalse(sync.pull(bob, spaceId, current()).fullResync)
        }

        @Test
        fun `history changes from list changes are sent as delta, not as the whole catalog`() {
            val since = current()
            lists.apply(anna, spaceId, listId, ListChange.CheckItem(milk))
            sync.push(bob, spaceId, since, listOf(change(ListChange.AddItem(ItemId("bread"), "Bread"))))

            val result = sync.pull(bob, spaceId, since)

            assertNull(result.catalog)
            assertEquals(listOf("Bread" to 0, "Milk" to 1), result.historyChanges.map { it.name to it.usageCount })
            assertTrue(sync.pull(bob, spaceId, current()).historyChanges.isEmpty())
        }

        @Test
        fun `removing a history entry sends the whole catalog instead of a delta`() {
            val since = current()
            catalog.removeHistory(anna, spaceId, "Milk")
            lists.apply(anna, spaceId, listId, ListChange.AddItem(ItemId("bread"), "Bread"))

            val result = sync.pull(bob, spaceId, since)

            assertEquals(listOf("Bread"), result.catalog!!.historyEntries().map { it.name })
            assertTrue(result.historyChanges.isEmpty())
        }

        @Test
        fun `strangers can't pull`() {
            assertThrows<DomainException> { sync.pull(UserId("x"), spaceId, 0) }
        }
    }

    @Nested
    inner class TwoClientsEndToEnd {
        @Test
        fun `both clients converge after syncing conflicting offline changes`() {
            val base = sync.pull(anna, spaceId, 0).seq
            // Both go offline. Anna deletes milk, Bob raises its quantity; both add an item.
            val annaResult = sync.push(anna, spaceId, base, listOf(
                SyncOperation.ChangeList("a1", listId, ListChange.DeleteItem(milk)),
                SyncOperation.ChangeList("a2", listId, ListChange.AddItem(ItemId("tea"), "Tea")),
            ))
            val bobResult = sync.push(bob, spaceId, base, listOf(
                SyncOperation.ChangeList("b1", listId, ListChange.EditItem(milk, ItemField.QUANTITY, "2")),
                SyncOperation.ChangeList("b2", listId, ListChange.AddItem(ItemId("coffee"), "Coffee")),
            ))

            assertTrue(annaResult.warnings.isEmpty())
            assertEquals(listOf("Anna"), bobResult.warnings.map { it.byName })

            val annaView = sync.pull(anna, spaceId, annaResult.seq)
            val bobView = sync.pull(bob, spaceId, 0)
            assertEquals(setOf("milk", "coffee"), annaView.lists.single().items.map { it.id.value }.toSet())
            assertEquals(setOf("Milk", "Tea", "Coffee"), bobView.lists.single().items.map { it.name }.toSet())
            assertEquals("2", bobView.lists.single().items.first { it.id == milk }.quantity)
        }
    }
}
