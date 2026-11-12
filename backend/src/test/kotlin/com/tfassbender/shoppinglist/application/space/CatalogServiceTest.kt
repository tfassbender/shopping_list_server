package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.InMemoryCatalogRepository
import com.tfassbender.shoppinglist.application.InMemoryListRepository
import com.tfassbender.shoppinglist.application.InMemorySequenceCounter
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.InMemorySyncStateRepository
import com.tfassbender.shoppinglist.application.list.ListStore
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.list.ShoppingListService
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.space.CategoryId
import com.tfassbender.shoppinglist.domain.list.ItemField
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/** Catalog use cases and how list changes feed the item history. */
class CatalogServiceTest {

    private val clock = MutableClock()
    private val spaces = InMemorySpaceRepository()
    private val catalogs = InMemoryCatalogRepository()
    private val locks = SpaceLocks()
    private val access = SpaceAccess(spaces)
    private val sequence = InMemorySequenceCounter()
    private val catalog = CatalogService(catalogs, sequence, access, locks, clock)
    private val listRepo = InMemoryListRepository()
    private val lists = ShoppingListService(listRepo, ListStore(listRepo, InMemorySyncStateRepository(), clock), sequence, access, locks, clock, catalog)

    private val user = UserId("u")
    private val spaceId = SpaceId("s")
    private val dairy = CategoryId("dairy")

    init {
        spaces.save(Space.create(spaceId, "Home", user, clock.instant()))
        catalog.createDefaults(spaceId, Language.EN)
    }

    private val listId = lists.create(user, spaceId, "Groceries").id

    @Test
    fun `adding an item teaches the history, checking counts usage`() {
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m1"), "Milk", "1", "l", categoryId = dairy))
        assertEquals(0, catalogs.find(spaceId).historyFor("milk")!!.usageCount)

        lists.apply(user, spaceId, listId, ListChange.CheckItem(ItemId("m1")))
        val entry = catalogs.find(spaceId).historyFor("milk")!!
        assertEquals(1, entry.usageCount)
        assertEquals(dairy, entry.categoryId)
        assertEquals("l", entry.unit)
    }

    @Test
    fun `new items without category get the category from the history`() {
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m1"), "Milk", categoryId = dairy))
        val list = lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m2"), "MILK"))
        assertEquals(dairy, list.item(ItemId("m2"))!!.categoryId)
    }

    @Test
    fun `editing the category of an item updates the history`() {
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m1"), "Milk"))
        assertNull(catalogs.find(spaceId).historyFor("milk")!!.categoryId)

        lists.apply(user, spaceId, listId, ListChange.EditItem(ItemId("m1"), ItemField.CATEGORY, "dairy"))

        assertEquals(dairy, catalogs.find(spaceId).suggestedCategory("Milk"))
    }

    @Test
    fun `suggestions require membership`() {
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m1"), "Milk"))
        assertEquals(listOf("Milk"), catalog.suggestions(user, spaceId, "mi", 5).map { it.name })
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { catalog.suggestions(UserId("x"), spaceId, "mi", 5) }.code)
    }

    @Test
    fun `every catalog change gets a new space seq so clients pull it`() {
        val before = catalogs.find(spaceId).seq

        val updated = catalog.updateCategory(user, spaceId, dairy, " Milk & eggs ", "#ffffff")

        assertEquals("Milk & eggs", updated.category(dairy)!!.name)
        assertEquals(sequence.current(spaceId), updated.seq)
        assertTrue(updated.seq > before)
    }

    @Test
    fun `history can be listed, renamed and cleaned up through the service`() {
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("m1"), "Mlik", categoryId = dairy))
        lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("b1"), "Bread"))

        assertEquals(listOf("Bread", "Milk"), catalog.renameHistory(user, spaceId, "mlik", "Milk").map { it.name })
        assertEquals(listOf("Milk"), catalog.removeHistory(user, spaceId, "BREAD").map { it.name })
        assertEquals(listOf("Milk"), catalog.history(user, spaceId).map { it.name })
        assertEquals(dairy, catalogs.find(spaceId).suggestedCategory("milk"))
    }

    @Test
    fun `the suggestion limit is clamped to 1 to 50`() {
        (1..60).forEach { lists.apply(user, spaceId, listId, ListChange.AddItem(ItemId("i$it"), "Item $it")) }

        assertEquals(1, catalog.suggestions(user, spaceId, "item", 0).size)
        assertEquals(50, catalog.suggestions(user, spaceId, "item", 1000).size)
    }

    @Test
    fun `an item added and deleted before the history is updated is not remembered`() {
        // An offline batch can add and delete an item; only the final state of the list is recorded.
        val added = lists.get(user, spaceId, listId)
            .apply(ListChange.AddItem(ItemId("x"), "Typo"), 100, clock.instant())
            .apply(ListChange.DeleteItem(ItemId("x")), 100, clock.instant())

        catalog.recordItemChanges(spaceId, added, listOf(ListChange.AddItem(ItemId("x"), "Typo")), 100)

        assertNull(catalogs.find(spaceId).historyFor("typo"))
    }

    @Test
    fun `strangers can't change the catalog`() {
        val stranger = UserId("stranger")
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { catalog.addCategory(stranger, spaceId, "X", "#000000") }.code)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { catalog.setUnits(stranger, spaceId, listOf("kg")) }.code)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { catalog.history(stranger, spaceId) }.code)
    }

    @Test
    fun `category management`() {
        val added = catalog.addCategory(user, spaceId, " Snacks ", "#123456", CategoryId("snacks"))
        assertEquals("Snacks", added.categories.last().name)

        val order = added.categories.map { it.id }.reversed()
        assertEquals(order, catalog.reorderCategories(user, spaceId, order).categories.map { it.id })
        assertEquals(order.size - 1, catalog.deleteCategory(user, spaceId, CategoryId("snacks")).categories.size)
        assertEquals(listOf("pcs", "Box"), catalog.setUnits(user, spaceId, listOf("pcs", "Box")).units)
    }
}
