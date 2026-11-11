package com.tfassbender.shoppinglist.domain.user

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.LayoutId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals

class UserFavoritesTest {

    private val aldi = LayoutId("aldi")
    private val rewe = LayoutId("rewe")
    private val none = UserFavorites(UserId("u"))

    private fun full(layoutId: LayoutId) =
        (1..UserFavorites.MAX_PER_LAYOUT).fold(none) { favorites, i -> favorites.add(layoutId, "Item $i") }

    @Test
    fun `at most MAX_PER_LAYOUT favorites per layout`() {
        assertEquals("TOO_MANY_FAVORITES", assertThrows<DomainException> { full(aldi).add(aldi, "One more") }.code)
    }

    @Test
    fun `a full layout still accepts an existing favorite and other layouts`() {
        val full = full(aldi)
        // Re-adding is idempotent (e.g. a client retrying), so it must not hit the limit.
        assertEquals(full, full.add(aldi, " ITEM 1 "))
        assertEquals(setOf("milk"), full.add(rewe, "Milk").favoritesOf(rewe))
    }

    @Test
    fun `names longer than an item name are rejected`() {
        val tooLong = "x".repeat(UserFavorites.MAX_NAME_LENGTH + 1)
        assertEquals("INVALID_ITEM_NAME", assertThrows<DomainException> { none.add(aldi, tooLong) }.code)
    }

    @Test
    fun `removing an unknown favorite is harmless`() {
        val favorites = none.add(aldi, "Milk")
        assertEquals(favorites, favorites.remove(aldi, "Bread"))
        assertEquals(none, none.remove(rewe, "Milk")) // no empty entry is left behind for the layout
    }
}
