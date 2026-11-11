package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserFavorites
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertTrue

class ShopLayoutTest {

    private val layout = ShopLayout.create(LayoutId("aldi"), SpaceId("s"), " Aldi ", LayoutMode.CATEGORIES, listOf(CategoryId("veg")), Instant.EPOCH)

    @Test
    fun `create, rename, switch mode keeps both orders`() {
        assertEquals("Aldi", layout.name)
        val switched = layout.withItemOrder(listOf("Milk")).withMode(LayoutMode.ITEMS).withMode(LayoutMode.CATEGORIES)
        assertEquals(listOf(CategoryId("veg")), switched.categoryOrder)
        assertEquals(listOf("Milk"), switched.itemOrder)
        assertThrows<DomainException> { layout.rename(" ") }
    }

    @Test
    fun `orders must be unique`() {
        assertEquals("INVALID_ORDER", assertThrows<DomainException> { layout.withCategoryOrder(listOf(CategoryId("a"), CategoryId("a"))) }.code)
        assertEquals("INVALID_ORDER", assertThrows<DomainException> { layout.withItemOrder(listOf("Milk", " milk")) }.code)
        assertEquals(listOf("Milk", "Bread"), layout.withItemOrder(listOf(" Milk", "", "Bread")).itemOrder)
    }

    @Test
    fun `connect and disconnect lists`() {
        val connected = layout.connect(ListId("l1")).connect(ListId("l2")).connect(ListId("l1"))
        assertEquals(setOf(ListId("l1"), ListId("l2")), connected.listIds)
        assertEquals(setOf(ListId("l2")), connected.disconnect(ListId("l1")).listIds)
    }

    @Test
    fun `favorites are per layout and case-insensitive`() {
        val favorites = UserFavorites(UserId("u")).add(layout.id, " Milk ").add(LayoutId("rewe"), "Bread")
        assertTrue(favorites.isFavorite(layout.id, "MILK"))
        assertFalse(favorites.isFavorite(layout.id, "Bread"))
        assertEquals(setOf("milk"), favorites.favoritesOf(layout.id))

        val removed = favorites.remove(layout.id, "milk")
        assertFalse(removed.isFavorite(layout.id, "Milk"))
        assertFalse(layout.id in removed.byLayout)
        assertThrows<DomainException> { favorites.add(layout.id, "  ") }
    }
}
