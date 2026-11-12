package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.space.SpaceId
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
    fun `item order entries are limited in number and length`() {
        val tooMany = (0..ShopLayout.MAX_ITEM_ENTRIES).map { "Item $it" }
        assertEquals("INVALID_ORDER", assertThrows<DomainException> { layout.withItemOrder(tooMany) }.code)
        val tooLong = "x".repeat(ShoppingList.MAX_ITEM_NAME_LENGTH + 1)
        assertEquals("INVALID_ORDER", assertThrows<DomainException> { layout.withItemOrder(listOf(tooLong)) }.code)
        assertEquals(ShopLayout.MAX_ITEM_ENTRIES, layout.withItemOrder(tooMany.drop(1)).itemOrder.size)
    }

    @Test
    fun `connect and disconnect lists`() {
        val connected = layout.connect(ListId("l1")).connect(ListId("l2")).connect(ListId("l1"))
        assertEquals(setOf(ListId("l1"), ListId("l2")), connected.listIds)
        assertEquals(setOf(ListId("l2")), connected.disconnect(ListId("l1")).listIds)
    }
}
