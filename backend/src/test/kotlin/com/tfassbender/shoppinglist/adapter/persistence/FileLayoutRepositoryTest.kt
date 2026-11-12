package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.exists
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FileLayoutRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    private val files by lazy { JsonFiles(dataDir) }
    private val spaceId = SpaceId("s1")
    private val layout = ShopLayout.create(LayoutId("aldi"), spaceId, "Aldi", LayoutMode.ITEMS, listOf(CategoryId("veg"), CategoryId("dairy")), Instant.EPOCH)
        .withItemOrder(listOf("Bread", "Milk"))
        .connect(ListId("l1"))

    @Test
    fun `round-trips, lists by space and deletes layouts`() {
        val repository = FileLayoutRepository(files)
        repository.save(layout)
        repository.save(layout.copy(id = LayoutId("rewe"), name = "Rewe"))

        assertEquals(layout, repository.findById(spaceId, layout.id))
        assertTrue(dataDir.resolve("spaces/s1/layouts/aldi.json").exists())
        assertEquals(setOf("aldi", "rewe"), repository.findBySpace(spaceId).map { it.id.value }.toSet())

        repository.delete(spaceId, layout.id)
        assertNull(repository.findById(spaceId, layout.id))
    }
}
