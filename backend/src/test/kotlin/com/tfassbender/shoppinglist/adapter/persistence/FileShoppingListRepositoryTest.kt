package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.exists
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FileShoppingListRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    private val files by lazy { JsonFiles(dataDir) }
    private val repository by lazy { FileShoppingListRepository(files) }
    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val spaceId = SpaceId("s1")

    private val list = ShoppingList.create(ListId("l1"), spaceId, "Groceries", 1, t0)
        .apply(ListChange.AddItem(ItemId("milk"), "Milk", "2", "l", "low fat", CategoryId("dairy")), 2, t0)
        .apply(ListChange.AddItem(ItemId("bread"), "Bread"), 3, t0)
        .apply(ListChange.CheckItem(ItemId("bread")), 4, t0)
        .apply(ListChange.AddItem(ItemId("gone"), "Gone"), 5, t0)
        .apply(ListChange.DeleteItem(ItemId("gone")), 6, t0)

    @Test
    fun `round-trips a list including tombstones`() {
        repository.save(list)
        assertEquals(list, repository.findById(spaceId, list.id))
        assertTrue(dataDir.resolve("spaces/s1/lists/l1.json").exists())
    }

    @Test
    fun `finds all lists of a space only`() {
        repository.save(list)
        repository.save(ShoppingList.create(ListId("l2"), spaceId, "Hardware", 7, t0).markDeleted(8))
        repository.save(ShoppingList.create(ListId("l3"), SpaceId("other"), "Other", 1, t0))

        assertEquals(setOf("l1", "l2"), repository.findBySpace(spaceId).map { it.id.value }.toSet())
        assertNull(repository.findById(spaceId, ListId("l3")))
    }

    @Test
    fun `sequence counter starts at zero and increments persistently`() {
        val counter = FileSequenceCounter(files)
        assertEquals(0, counter.current(spaceId))
        assertEquals(1, counter.next(spaceId))
        assertEquals(2, FileSequenceCounter(files).next(spaceId))
        assertEquals(0, counter.current(SpaceId("other")))
    }
}
