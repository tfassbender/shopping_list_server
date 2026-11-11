package com.tfassbender.shoppinglist.domain.space

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.user.Language
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SpaceCatalogTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val dairy = Category(CategoryId("dairy"), "Dairy", "#90caf9")
    private val bakery = Category(CategoryId("bakery"), "Bakery", "#d4a056")
    private val catalog = SpaceCatalog(SpaceId("s")).addCategory(dairy).addCategory(bakery)

    @Nested
    inner class Categories {
        @Test
        fun `add, update, reorder and delete`() {
            val updated = catalog.updateCategory(dairy.id, "Milk products", "#000000")
            assertEquals("Milk products", updated.category(dairy.id)!!.name)

            val reordered = updated.reorderCategories(listOf(bakery.id, dairy.id))
            assertEquals(listOf(bakery.id, dairy.id), reordered.categories.map { it.id })

            assertEquals(listOf(bakery.id), reordered.deleteCategory(dairy.id).categories.map { it.id })
        }

        @Test
        fun `validation`() {
            assertEquals("INVALID_COLOR", assertThrows<DomainException> { Category(CategoryId("x"), "X", "red") }.code)
            assertEquals("INVALID_NAME", assertThrows<DomainException> { Category(CategoryId("x"), " ", "#ffffff") }.code)
            assertEquals("CATEGORY_EXISTS", assertThrows<DomainException> { catalog.addCategory(dairy) }.code)
            assertEquals("CATEGORY_NOT_FOUND", assertThrows<DomainException> { catalog.deleteCategory(CategoryId("nope")) }.code)
        }

        @Test
        fun `reorder must contain every category exactly once`() {
            listOf(listOf(dairy.id), listOf(dairy.id, dairy.id), listOf(dairy.id, bakery.id, CategoryId("x"))).forEach {
                assertEquals("INVALID_ORDER", assertThrows<DomainException> { catalog.reorderCategories(it) }.code)
            }
        }

        @Test
        fun `deleting a category clears it from the history`() {
            val learned = catalog.learn("Milk", dairy.id, "l", t0).deleteCategory(dairy.id)
            assertNull(learned.historyFor("milk")!!.categoryId)
            assertNull(learned.suggestedCategory("Milk"))
        }
    }

    @Test
    fun `units are cleaned and deduplicated`() {
        val result = catalog.withUnits(listOf(" kg ", "g", "KG", "", "l"))
        assertEquals(listOf("kg", "g", "l"), result.units)
        assertThrows<DomainException> { catalog.withUnits(listOf("x".repeat(21))) }
    }

    @Nested
    inner class History {
        @Test
        fun `learn remembers the latest category and unit without counting`() {
            val result = catalog.learn("Milk", dairy.id, "l", t0).learn(" milk ", bakery.id, null, t0.plusSeconds(5))
            val entry = result.historyFor("MILK")!!
            assertEquals(bakery.id, entry.categoryId)
            assertNull(entry.unit)
            assertEquals(0, entry.usageCount)
            assertEquals(1, result.history.size)
        }

        @Test
        fun `count usage increments and creates missing entries`() {
            val result = catalog.countUsage("Bread", bakery.id, null, t0).countUsage("bread", bakery.id, null, t0)
            assertEquals(2, result.historyFor("Bread")!!.usageCount)
        }

        @Test
        fun `suggested category only if it still exists`() {
            val learned = catalog.learn("Milk", dairy.id, null, t0)
            assertEquals(dairy.id, learned.suggestedCategory("milk"))
            assertNull(learned.suggestedCategory("unknown"))
            assertNull(catalog.learn("Weird", CategoryId("deleted"), null, t0).suggestedCategory("Weird"))
        }

        @Test
        fun `whitespace in names is normalized`() {
            assertEquals(catalog.learn("Whole   milk", null, null, t0).historyFor("whole milk")!!.name, "Whole   milk")
        }
    }

    @Nested
    inner class Suggestions {
        private val history = catalog
            .countUsage("Milk", dairy.id, "l", t0)
            .countUsage("Milk", dairy.id, "l", t0)
            .countUsage("Mineral water", null, null, t0)
            .countUsage("Mineral water", null, null, t0)
            .countUsage("Mineral water", null, null, t0)
            .learn("Mint", null, null, t0.plusSeconds(10))
            .countUsage("Oat milk", dairy.id, null, t0)
            .countUsage("Oat milk", dairy.id, null, t0)
            .countUsage("Oat milk", dairy.id, null, t0)
            .countUsage("Oat milk", dairy.id, null, t0)
            .countUsage("Bread", bakery.id, null, t0)

        @Test
        fun `name prefix matches rank before word matches, then by usage`() {
            assertEquals(listOf("Mineral water", "Milk", "Mint", "Oat milk"), history.suggestions("mi", 10).map { it.name })
        }

        @Test
        fun `matching is case-insensitive and limited`() {
            assertEquals(listOf("Mineral water", "Milk"), history.suggestions("MI", 2).map { it.name })
            assertEquals(listOf("Milk", "Oat milk"), history.suggestions("milk", 10).map { it.name })
        }

        @Test
        fun `recency breaks ties in usage`() {
            val tied = catalog.learn("Apple", null, null, t0).learn("Apricot", null, null, t0.plusSeconds(1))
            assertEquals(listOf("Apricot", "Apple"), tied.suggestions("ap", 5).map { it.name })
        }

        @Test
        fun `blank query and no matches give nothing`() {
            assertTrue(history.suggestions("  ", 10).isEmpty())
            assertTrue(history.suggestions("xyz", 10).isEmpty())
        }
    }

    @Test
    fun `defaults exist in both languages with valid colors`() {
        Language.entries.forEach { language ->
            val defaults = CatalogDefaults.create(SpaceId("s"), language)
            assertTrue(defaults.categories.size >= 5)
            assertTrue(defaults.units.isNotEmpty())
        }
        assertEquals("Milchprodukte & Eier", CatalogDefaults.create(SpaceId("s"), Language.DE).category(CategoryId("dairy"))!!.name)
    }
}
