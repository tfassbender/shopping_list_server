package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.space.CategoryId
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.ListChange.AddItem
import com.tfassbender.shoppinglist.domain.list.ListChange.CheckItem
import com.tfassbender.shoppinglist.domain.list.ListChange.DeleteItem
import com.tfassbender.shoppinglist.domain.list.ListChange.EditItem
import com.tfassbender.shoppinglist.domain.list.ListChange.RemoveChecked
import com.tfassbender.shoppinglist.domain.list.ListChange.RenameList
import com.tfassbender.shoppinglist.domain.list.ListChange.UncheckItem
import com.tfassbender.shoppinglist.domain.space.SpaceId
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.params.ParameterizedTest
import org.junit.jupiter.params.provider.ValueSource
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ShoppingListTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val milk = ItemId("milk")
    private val bread = ItemId("bread")
    private val empty = ShoppingList.create(ListId("l1"), SpaceId("s1"), " Groceries ", seq = 1, now = t0)

    /** Applies changes with increasing sequence numbers starting at 2. */
    private fun ShoppingList.applyAll(vararg changes: ListChange): ShoppingList =
        changes.foldIndexed(this) { index, list, change -> list.apply(change, seq = index + 2L, now = t0.plusSeconds(index.toLong())) }

    private val withTwo = empty.applyAll(AddItem(milk, "Milk", "2", "l"), AddItem(bread, "Bread"))

    @Nested
    inner class Creating {
        @Test
        fun `create trims the name`() {
            assertEquals("Groceries", empty.name)
            assertTrue(empty.items.isEmpty())
        }

        @ParameterizedTest
        @ValueSource(strings = ["", "   "])
        fun `blank list name is rejected`(name: String) {
            assertEquals("INVALID_NAME", assertThrows<DomainException> { ShoppingList.create(ListId("l"), SpaceId("s"), name, 1, t0) }.code)
        }

        @ParameterizedTest
        @ValueSource(strings = ["", "a/b", "../x", "with space", "ä"])
        fun `ids must be simple tokens`(id: String) {
            assertEquals("INVALID_ID", assertThrows<DomainException> { ItemId(id) }.code)
            assertThrows<DomainException> { ListId(id) }
        }
    }

    @Nested
    inner class AddingItems {
        @Test
        fun `items added at the same instant (one sync batch) still get distinct, increasing creation times`() {
            val eggs = ItemId("eggs")
            val list = listOf(AddItem(milk, "Milk"), AddItem(bread, "Bread"), AddItem(eggs, "Eggs"))
                .fold(empty) { current, change -> current.apply(change, seq = 2, now = t0) }

            assertEquals(listOf(t0, t0.plusMillis(1), t0.plusMillis(2)), list.items.map { it.createdAt })
            // later items keep the real time
            val later = list.apply(AddItem(ItemId("tea"), "Tea"), seq = 3, now = t0.plusSeconds(5))
            assertEquals(t0.plusSeconds(5), later.items.last().createdAt)
        }

        @Test
        fun `add item normalizes fields and stamps seq`() {
            val list = empty.apply(AddItem(milk, "  Milk ", " 2 ", "", "  "), seq = 7, now = t0)
            val item = list.item(milk)!!
            assertEquals("Milk", item.name)
            assertEquals("2", item.quantity)
            assertNull(item.unit)
            assertNull(item.note)
            assertEquals(7, item.seq)
            assertFalse(item.checked)
            assertEquals(t0, item.createdAt)
        }

        @Test
        fun `duplicate item id is a conflict`() {
            assertEquals("ITEM_EXISTS", assertThrows<DomainException> { withTwo.applyAll(AddItem(milk, "Milk again")) }.code)
        }

        @Test
        fun `a deleted item's id can't be reused`() {
            val deleted = withTwo.applyAll(DeleteItem(milk))
            assertThrows<DomainException> { deleted.applyAll(AddItem(milk, "Milk")) }
        }

        @Test
        fun `invalid names and too long fields are rejected`() {
            assertEquals("INVALID_ITEM_NAME", assertThrows<DomainException> { empty.applyAll(AddItem(milk, " ")) }.code)
            assertEquals("INVALID_ITEM_NAME", assertThrows<DomainException> { empty.applyAll(AddItem(milk, "x".repeat(101))) }.code)
            assertEquals("INVALID_ITEM_FIELD", assertThrows<DomainException> { empty.applyAll(AddItem(milk, "Milk", quantity = "1".repeat(21))) }.code)
            assertEquals("INVALID_ITEM_FIELD", assertThrows<DomainException> { empty.applyAll(AddItem(milk, "Milk", note = "n".repeat(201))) }.code)
        }

        @Test
        fun `item names may repeat - they are different items`() {
            val list = withTwo.applyAll(AddItem(ItemId("milk2"), "Milk"))
            assertEquals(2, list.activeItems.count { it.name == "Milk" })
        }
    }

    @Nested
    inner class EditingItems {
        @Test
        fun `edit changes exactly one field and stamps seq`() {
            val list = withTwo.apply(EditItem(milk, ItemField.QUANTITY, "3"), seq = 50, now = t0)
            val item = list.item(milk)!!
            assertEquals("3", item.quantity)
            assertEquals("l", item.unit)
            assertEquals("Milk", item.name)
            assertEquals(50, item.seq)
            assertEquals(3, list.item(bread)!!.seq) // untouched item keeps its seq
        }

        @Test
        fun `null or blank clears optional fields`() {
            val list = withTwo.applyAll(EditItem(milk, ItemField.UNIT, null), EditItem(milk, ItemField.QUANTITY, " "))
            assertNull(list.item(milk)!!.unit)
            assertNull(list.item(milk)!!.quantity)
        }

        @Test
        fun `name can't be cleared`() {
            assertThrows<DomainException> { withTwo.applyAll(EditItem(milk, ItemField.NAME, null)) }
            assertEquals("Fresh milk", withTwo.applyAll(EditItem(milk, ItemField.NAME, " Fresh milk")).item(milk)!!.name)
        }

        @Test
        fun `category can be set and cleared`() {
            val set = withTwo.applyAll(EditItem(milk, ItemField.CATEGORY, "dairy"))
            assertEquals(CategoryId("dairy"), set.item(milk)!!.categoryId)
            assertNull(set.applyAll(EditItem(milk, ItemField.CATEGORY, "")).item(milk)!!.categoryId)
        }

        @Test
        fun `later edit of the same field wins`() {
            val list = withTwo.applyAll(EditItem(milk, ItemField.QUANTITY, "3"), EditItem(milk, ItemField.QUANTITY, "5"))
            assertEquals("5", list.item(milk)!!.quantity)
        }

        @Test
        fun `editing unknown items is not found`() {
            assertEquals("ITEM_NOT_FOUND", assertThrows<DomainException> { withTwo.applyAll(EditItem(ItemId("x"), ItemField.NAME, "X")) }.code)
            // a deleted item is not "not found": editing it restores it (merge rule "edit wins over delete")
            val deleted = withTwo.applyAll(DeleteItem(milk))
            assertTrue(deleted.applyAll(CheckItem(milk)).item(milk)!!.isActive)
        }
    }

    @Nested
    inner class CheckingAndDeleting {
        @Test
        fun `check and uncheck`() {
            val checked = withTwo.applyAll(CheckItem(milk))
            assertTrue(checked.item(milk)!!.checked)
            assertFalse(checked.applyAll(UncheckItem(milk)).item(milk)!!.checked)
        }

        @Test
        fun `checking twice is harmless`() {
            assertTrue(withTwo.applyAll(CheckItem(milk), CheckItem(milk)).item(milk)!!.checked)
        }

        @Test
        fun `delete keeps a tombstone with the delete seq`() {
            val list = withTwo.apply(DeleteItem(milk), seq = 99, now = t0)
            val tombstone = list.item(milk)!!
            assertTrue(tombstone.deleted)
            assertEquals(99, tombstone.seq)
            assertEquals(listOf(bread), list.activeItems.map { it.id })
            assertEquals(2, list.items.size)
        }

        @Test
        fun `remove checked deletes only checked active items`() {
            val third = ItemId("eggs")
            val list = withTwo.applyAll(AddItem(third, "Eggs"), CheckItem(milk), CheckItem(third))
                .apply(RemoveChecked(), seq = 42, now = t0)

            assertEquals(listOf(bread), list.activeItems.map { it.id })
            assertEquals(42, list.item(milk)!!.seq)
            assertEquals(42, list.item(third)!!.seq)
            assertEquals(3, list.item(bread)!!.seq)
        }

        @Test
        fun `remove checked doesn't touch older tombstones`() {
            val list = withTwo.applyAll(CheckItem(milk), DeleteItem(milk), CheckItem(bread))
            val after = list.apply(RemoveChecked(), seq = 100, now = t0)
            assertEquals(list.item(milk)!!.seq, after.item(milk)!!.seq)
            assertEquals(100, after.item(bread)!!.seq)
        }

        @Test
        fun `remove checked on a list without checked items changes nothing`() {
            assertEquals(withTwo.items, withTwo.applyAll(RemoveChecked()).items)
        }
    }

    @Nested
    inner class ListLevel {
        @Test
        fun `rename stamps the list seq`() {
            val list = withTwo.apply(RenameList(" Weekend "), seq = 10, now = t0)
            assertEquals("Weekend", list.name)
            assertEquals(10, list.seq)
            assertThrows<DomainException> { withTwo.applyAll(RenameList("")) }
        }

        @Test
        fun `a deleted list accepts no changes`() {
            val deleted = withTwo.markDeleted(20, t0)
            assertTrue(deleted.deleted)
            assertEquals("LIST_NOT_FOUND", assertThrows<DomainException> { deleted.applyAll(AddItem(ItemId("x"), "X")) }.code)
        }

        @Test
        fun `item limit is enforced`() {
            val full = (1..ShoppingList.MAX_ITEMS).fold(empty) { list, i -> list.apply(AddItem(ItemId("i$i"), "Item $i"), 2, t0) }
            assertEquals("LIST_FULL", assertThrows<DomainException> { full.applyAll(AddItem(ItemId("one-more"), "X")) }.code)
        }

        @Test
        fun `deleted items don't count towards the item limit`() {
            val full = (1..ShoppingList.MAX_ITEMS).fold(empty) { list, i -> list.apply(AddItem(ItemId("i$i"), "Item $i"), 2, t0) }
            val oneDeleted = full.apply(DeleteItem(ItemId("i1")), 3, t0)

            val list = oneDeleted.apply(AddItem(ItemId("one-more"), "X"), 4, t0)

            assertEquals(ShoppingList.MAX_ITEMS, list.activeItems.size)
            assertTrue(list.item(ItemId("i1"))!!.deleted) // the tombstone is still kept for the sync
        }

        @Test
        fun `tombstones without deletion time are never purged`() {
            // Files written before deletedAt existed have tombstones without it; they must not vanish silently.
            val legacy = withTwo.copy(items = withTwo.items.map { if (it.id == milk) it.copy(deleted = true, deletedAt = null) else it })

            val (purged, purgedSeq) = legacy.purgeTombstones(t0.plusSeconds(1_000_000))

            assertTrue(purged.item(milk)!!.deleted)
            assertEquals(0, purgedSeq)
        }
    }
}
