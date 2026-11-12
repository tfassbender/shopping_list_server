package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.space.CategoryId
import com.tfassbender.shoppinglist.domain.space.Category
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class ItemSorterTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val spaceId = SpaceId("s")
    private val veg = CategoryId("veg")
    private val dairy = CategoryId("dairy")
    private val bakery = CategoryId("bakery")

    // Space default order: veg, dairy, bakery
    private val catalog = SpaceCatalog(spaceId)
        .addCategory(Category(veg, "Vegetables", "#00ff00"))
        .addCategory(Category(dairy, "Dairy", "#0000ff"))
        .addCategory(Category(bakery, "Bakery", "#aa8800"))

    private var created = 0L
    private fun item(name: String, category: CategoryId? = null, checked: Boolean = false) =
        Item(ItemId(name.replace(' ', '-')), name, categoryId = category, checked = checked, createdAt = t0.plusSeconds(created++), seq = 1)

    private fun layout(mode: LayoutMode = LayoutMode.CATEGORIES, categories: List<CategoryId> = emptyList(), items: List<String> = emptyList()) =
        ShopLayout(LayoutId("shop"), spaceId, "Shop", mode, categories, items, emptySet(), t0)

    private fun sortedNames(
        items: List<Item>,
        layout: ShopLayout,
        catalog: SpaceCatalog = this.catalog,
        checkedToEnd: Boolean = false,
    ) = ItemSorter.sort(items, layout, catalog, checkedToEnd).map { it.name }

    @Nested
    inner class CategoryMode {
        @Test
        fun `items follow the layout's category order`() {
            val items = listOf(item("Milk", dairy), item("Bread", bakery), item("Carrots", veg))
            assertEquals(listOf("Bread", "Milk", "Carrots"), sortedNames(items, layout(categories = listOf(bakery, dairy, veg))))
        }

        @Test
        fun `categories missing in the layout follow in the space's default order, uncategorized last`() {
            val items = listOf(item("Batteries"), item("Milk", dairy), item("Bread", bakery), item("Carrots", veg))
            // layout only knows bakery; then veg, dairy (default order); then the uncategorized item
            assertEquals(listOf("Bread", "Carrots", "Milk", "Batteries"), sortedNames(items, layout(categories = listOf(bakery))))
        }

        @Test
        fun `deleted categories in the layout or on items are ignored`() {
            val items = listOf(item("Ghost", CategoryId("deleted")), item("Milk", dairy))
            assertEquals(listOf("Milk", "Ghost"), sortedNames(items, layout(categories = listOf(CategoryId("deleted"), dairy))))
        }

        @Test
        fun `new items are placed automatically by their category`() {
            val items = listOf(item("Bread", bakery), item("Brand new cheese", dairy))
            assertEquals(listOf("Brand new cheese", "Bread"), sortedNames(items, layout(categories = listOf(dairy, bakery))))
        }
    }

    @Nested
    inner class ItemMode {
        @Test
        fun `items follow the layout's item order case-insensitively`() {
            val items = listOf(item("milk"), item("Bread"), item("Apples"))
            val layout = layout(LayoutMode.ITEMS, items = listOf("BREAD", "Apples", "Milk"))
            assertEquals(listOf("Bread", "Apples", "milk"), sortedNames(items, layout))
        }

        @Test
        fun `items unknown to the layout come last, sorted by the remaining rules`() {
            val items = listOf(item("Zucchini"), item("Avocado"), item("Bread"))
            val layout = layout(LayoutMode.ITEMS, items = listOf("Bread"))
            assertEquals(listOf("Bread", "Avocado", "Zucchini"), sortedNames(items, layout))
        }

        @Test
        fun `category order is ignored in item mode`() {
            val items = listOf(item("Milk", dairy), item("Carrots", veg))
            val layout = layout(LayoutMode.ITEMS, categories = listOf(veg, dairy), items = listOf("Milk", "Carrots"))
            assertEquals(listOf("Milk", "Carrots"), sortedNames(items, layout))
        }
    }

    @Nested
    inner class TieBreakers {
        @Test
        fun `most bought first within the same layout position`() {
            val history = catalog
                .countUsage("Cheese", dairy, null, t0)
                .countUsage("Butter", dairy, null, t0).countUsage("Butter", dairy, null, t0)
            val items = listOf(item("Cheese", dairy), item("Butter", dairy), item("Ayran", dairy), item("Quark", dairy))
            assertEquals(
                listOf("Butter", "Cheese", "Ayran", "Quark"),
                sortedNames(items, layout(categories = listOf(dairy)), history),
            )
        }

        @Test
        fun `name is the last criterion, case-insensitive`() {
            val items = listOf(item("banana"), item("Apple"), item("cherry"))
            assertEquals(listOf("Apple", "banana", "cherry"), sortedNames(items, layout()))
        }

        @Test
        fun `same name keeps creation order (stable)`() {
            val first = item("Milk", dairy)
            val second = item("Milk", dairy)
            val result = ItemSorter.sort(listOf(second, first), layout(), catalog, false)
            assertEquals(listOf(first.id, second.id), result.map { it.id })
        }
    }

    @Nested
    inner class CheckedToEnd {
        private val items = listOf(item("Bread", bakery, checked = true), item("Milk", dairy), item("Carrots", veg, checked = true), item("Cheese", dairy))
        private val layout = layout(categories = listOf(bakery, dairy, veg))

        @Test
        fun `checked items go to the end, both groups sorted by the layout`() {
            assertEquals(listOf("Cheese", "Milk", "Bread", "Carrots"), sortedNames(items, layout, checkedToEnd = true))
        }

        @Test
        fun `without the setting checked items stay in place`() {
            assertEquals(listOf("Bread", "Cheese", "Milk", "Carrots"), sortedNames(items, layout, checkedToEnd = false))
        }
    }

    @Test
    fun `empty list sorts to empty`() {
        assertTrue(ItemSorter.sort(emptyList(), layout(), catalog, true).isEmpty())
    }
}
