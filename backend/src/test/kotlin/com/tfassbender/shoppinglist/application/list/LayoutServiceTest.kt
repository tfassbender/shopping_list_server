package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.InMemoryCatalogRepository
import com.tfassbender.shoppinglist.application.InMemoryFavoritesRepository
import com.tfassbender.shoppinglist.application.InMemoryLayoutRepository
import com.tfassbender.shoppinglist.application.InMemoryListRepository
import com.tfassbender.shoppinglist.application.InMemorySequenceCounter
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.space.CatalogService
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.ItemId
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
    private val catalog = CatalogService(catalogs, access, locks, clock)
    private val lists = ShoppingListService(listRepo, InMemorySequenceCounter(), access, locks, clock, catalog)
    private val service = LayoutService(InMemoryLayoutRepository(), InMemoryFavoritesRepository(), catalogs, listRepo, users, access, locks, clock)

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
    fun `favorites are personal`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        service.addFavorite(anna, spaceId, layout.id, "Milk")
        assertEquals(setOf("milk"), service.favorites(anna, spaceId, layout.id))
        assertTrue(service.favorites(bob, spaceId, layout.id).isEmpty())
        assertTrue(service.removeFavorite(anna, spaceId, layout.id, "MILK").isEmpty())
    }

    @Test
    fun `strangers and unknown layouts`() {
        val layout = service.create(anna, spaceId, "Aldi", LayoutMode.CATEGORIES)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.get(UserId("x"), spaceId, layout.id) }.code)
        service.delete(bob, spaceId, layout.id)
        assertEquals("LAYOUT_NOT_FOUND", assertThrows<DomainException> { service.get(anna, spaceId, layout.id) }.code)
    }
}
