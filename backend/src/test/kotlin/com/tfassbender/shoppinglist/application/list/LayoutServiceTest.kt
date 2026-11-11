package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.InMemoryCatalogRepository
import com.tfassbender.shoppinglist.application.InMemoryFavoritesRepository
import com.tfassbender.shoppinglist.application.InMemoryLayoutRepository
import com.tfassbender.shoppinglist.application.InMemoryListRepository
import com.tfassbender.shoppinglist.application.InMemorySequenceCounter
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.InMemorySyncStateRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.space.CatalogService
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class LayoutServiceTest {

    private val clock = MutableClock()
    private val spaces = InMemorySpaceRepository()
    private val users = InMemoryUserRepository()
    private val catalogs = InMemoryCatalogRepository()
    private val listRepo = InMemoryListRepository()
    private val locks = SpaceLocks()
    private val access = SpaceAccess(spaces)
    private val sequence = InMemorySequenceCounter()
    private val catalog = CatalogService(catalogs, sequence, access, locks, clock)
    private val lists = ShoppingListService(listRepo, ListStore(listRepo, InMemorySyncStateRepository(), clock), sequence, access, locks, clock, catalog)
    private val service = LayoutService(InMemoryLayoutRepository(), InMemoryFavoritesRepository(), catalogs, listRepo, users, sequence, access, locks, clock)

    private val anna = UserId("anna")
    private val bob = UserId("bob")
    private val spaceId = SpaceId("s")
    private val veg = CategoryId("fruit-vegetables")
    private val dairy = CategoryId("dairy")
    private val bakery = CategoryId("bakery")

    init {
        val now = clock.instant()
        users.save(User(anna, Email.of("anna@example.com"), "Anna", "h", true, now, UserSettings(checkedItemsToEnd = true)))
        users.save(User(bob, Email.of("bob@example.com"), "Bob", "h", true, now, UserSettings(checkedItemsToEnd = false)))
        spaces.save(Space.create(spaceId, "Home", anna, now).addInvite(Invite(InviteId("i"), "h", anna, now, now.plusSeconds(60))).acceptInvite("h", bob, now))
        catalog.createDefaults(spaceId, Language.EN)
    }

    private val listId: ListId = lists.create(anna, spaceId, "Groceries").id

    @Test
    fun `a new layout starts with the space's category order`() {
        val layout = service.create(bob, spaceId, "Aldi", LayoutMode.CATEGORIES)
        assertEquals(catalogs.find(spaceId).categories.map { it.id }, layout.categoryOrder)
    }

    @Test
    fun `sorting uses layout, personal favorites and personal checked-to-end setting`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        service.setCategoryOrder(anna, spaceId, layout.id, listOf(bakery, dairy, veg))
        lists.applyChanges(
            anna, spaceId, listId,
            listOf(
                ListChange.AddItem(ItemId("milk"), "Milk", categoryId = dairy),
                ListChange.AddItem(ItemId("cheese"), "Cheese", categoryId = dairy),
                ListChange.AddItem(ItemId("bread"), "Bread", categoryId = bakery),
                ListChange.AddItem(ItemId("apples"), "Apples", categoryId = veg),
                ListChange.CheckItem(ItemId("bread")),
            ),
        )
        service.addFavorite(anna, spaceId, layout.id, "milk")
        val list = lists.get(anna, spaceId, listId)

        val forAnna = service.sort(anna, list, layout.id)
        assertEquals(listOf("Milk", "Cheese", "Apples", "Bread"), forAnna.map { it.item.name })
        assertTrue(forAnna.first().favorite)

        // Bob: no favorites, checked items stay in place
        assertEquals(listOf("Bread", "Cheese", "Milk", "Apples"), service.sort(bob, list, layout.id).map { it.item.name })
    }

    @Test
    fun `category order may only contain existing categories`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        assertEquals("CATEGORY_NOT_FOUND", assertThrows<DomainException> { service.setCategoryOrder(anna, spaceId, layout.id, listOf(CategoryId("nope"))) }.code)
    }

    @Test
    fun `connect lists, which must exist`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.ITEMS)
        assertEquals(setOf(listId), service.connectList(bob, spaceId, layout.id, listId).listIds)
        assertEquals("LIST_NOT_FOUND", assertThrows<DomainException> { service.connectList(bob, spaceId, layout.id, ListId("missing")) }.code)
        assertTrue(service.disconnectList(bob, spaceId, layout.id, listId).listIds.isEmpty())
    }

    @Test
    fun `a copy takes mode, orders and connected lists, but no favorites`() {
        val aldi = service.create(anna, spaceId, "Aldi Nord", LayoutMode.ITEMS)
        service.setCategoryOrder(anna, spaceId, aldi.id, listOf(bakery, dairy))
        service.setItemOrder(anna, spaceId, aldi.id, listOf("Bread", "Milk"))
        service.connectList(anna, spaceId, aldi.id, listId)
        service.addFavorite(anna, spaceId, aldi.id, "Milk")

        val copy = service.copy(bob, spaceId, aldi.id, " Aldi Süd ")

        assertTrue(copy.id != aldi.id)
        assertEquals("Aldi Süd", copy.name)
        assertEquals(LayoutMode.ITEMS, copy.mode)
        assertEquals(listOf(bakery, dairy), copy.categoryOrder)
        assertEquals(listOf("Bread", "Milk"), copy.itemOrder)
        assertEquals(setOf(listId), copy.listIds)
        assertTrue(copy.seq > service.get(anna, spaceId, aldi.id).seq) // new seq, so other clients pull it
        assertTrue(service.favorites(anna, spaceId, copy.id).isEmpty())
        assertEquals(listOf("Aldi Nord", "Aldi Süd"), service.layouts(anna, spaceId).map { it.name }) // the original is unchanged
    }

    @Test
    fun `copy validation`() {
        val aldi = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        assertEquals("INVALID_NAME", assertThrows<DomainException> { service.copy(anna, spaceId, aldi.id, " ") }.code)
        assertEquals("LAYOUT_EXISTS", assertThrows<DomainException> { service.copy(anna, spaceId, aldi.id, "Copy", aldi.id) }.code)
        assertEquals("LAYOUT_NOT_FOUND", assertThrows<DomainException> { service.copy(anna, spaceId, LayoutId("missing"), "Copy") }.code)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.copy(UserId("x"), spaceId, aldi.id, "Copy") }.code)
    }

    @Test
    fun `favorites are personal`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        service.addFavorite(anna, spaceId, layout.id, "Milk")
        assertEquals(setOf("milk"), service.favorites(anna, spaceId, layout.id))
        assertTrue(service.favorites(bob, spaceId, layout.id).isEmpty())
        assertTrue(service.removeFavorite(anna, spaceId, layout.id, "MILK").isEmpty())
    }

    @Test
    fun `layouts are listed by name, ignoring case`() {
        service.create(anna, spaceId, "rewe", LayoutMode.CATEGORIES)
        service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        service.create(bob, spaceId, "Lidl", LayoutMode.ITEMS)

        assertEquals(listOf("Aldi", "Lidl", "rewe"), service.layouts(bob, spaceId).map { it.name })
    }

    @Test
    fun `a client-generated layout id can't be used twice`() {
        val id = com.tfassbender.shoppinglist.domain.list.LayoutId("offline-layout")
        service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES, id)
        assertEquals("LAYOUT_EXISTS", assertThrows<DomainException> { service.create(bob, spaceId, "Rewe", LayoutMode.ITEMS, id) }.code)
        assertEquals("Aldi", service.get(anna, spaceId, id).name)
    }

    @Test
    fun `update renames and switches the mode without losing the orders`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        service.setItemOrder(anna, spaceId, layout.id, listOf("Milk", "Bread"))

        val updated = service.update(bob, spaceId, layout.id, " Aldi Süd ", LayoutMode.ITEMS)

        assertEquals("Aldi Süd", updated.name)
        assertEquals(LayoutMode.ITEMS, updated.mode)
        assertEquals(listOf("Milk", "Bread"), updated.itemOrder)
        assertEquals(layout.categoryOrder, updated.categoryOrder)
    }

    @Test
    fun `every layout change and deletion advances the space seq`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        val afterCreate = sequence.current(spaceId)
        assertEquals(afterCreate, layout.seq)

        assertEquals(afterCreate + 1, service.setItemOrder(anna, spaceId, layout.id, listOf("Milk")).seq)
        service.delete(anna, spaceId, layout.id)
        assertEquals(afterCreate + 2, sequence.current(spaceId))
    }

    @Test
    fun `a deleted list can't be connected`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        lists.delete(anna, spaceId, listId)
        assertEquals("LIST_NOT_FOUND", assertThrows<DomainException> { service.connectList(anna, spaceId, layout.id, listId) }.code)
    }

    @Test
    fun `favorites need an existing layout`() {
        val missing = com.tfassbender.shoppinglist.domain.list.LayoutId("missing")
        assertEquals("LAYOUT_NOT_FOUND", assertThrows<DomainException> { service.addFavorite(anna, spaceId, missing, "Milk") }.code)
        assertEquals("LAYOUT_NOT_FOUND", assertThrows<DomainException> { service.favorites(anna, spaceId, missing) }.code)
    }

    @Test
    fun `strangers and unknown layouts`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.get(UserId("x"), spaceId, layout.id) }.code)
        service.delete(bob, spaceId, layout.id)
        assertEquals("LAYOUT_NOT_FOUND", assertThrows<DomainException> { service.get(anna, spaceId, layout.id) }.code)
    }
}
