package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.space.CatalogDefaults
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Language
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Path
import java.time.Instant
import kotlin.test.assertEquals

class FileCatalogRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    private val repository by lazy { FileCatalogRepository(JsonFiles(dataDir)) }

    @Test
    fun `missing catalog is empty`() {
        assertEquals(SpaceCatalog(SpaceId("s")), repository.find(SpaceId("s")))
    }

    @Test
    fun `round-trips categories in order, units and history`() {
        val t0 = Instant.parse("2026-01-01T10:00:00Z")
        val catalog = CatalogDefaults.create(SpaceId("s"), Language.DE)
            .reorderCategories(CatalogDefaults.create(SpaceId("s"), Language.DE).categories.map { it.id }.reversed())
            .learn("Milch", CategoryId("dairy"), "l", t0)
            .countUsage("Brot", null, null, t0)
            .let { it.stampHistoryChanges(it.removeHistory("Brot"), 5) }

        repository.save(catalog)

        assertEquals(catalog, repository.find(SpaceId("s")))
    }

    @Test
    fun `older files without seqs load, history is looked up case-insensitively`() {
        val dir = dataDir.resolve("spaces/s")
        java.nio.file.Files.createDirectories(dir)
        java.nio.file.Files.writeString(
            dir.resolve("catalog.json"),
            """{"categories":[{"id":"dairy","name":"Dairy","color":"#90caf9"}],
               "history":[{"name":"Whole  Milk","categoryId":"dairy","unit":null,"usageCount":2,"lastUsed":"2026-01-01T10:00:00Z"}]}""",
        )

        val catalog = repository.find(SpaceId("s"))

        assertEquals(0, catalog.seq)
        assertEquals(emptyList(), catalog.units)
        assertEquals(0, catalog.historyFor("whole milk")!!.seq)
        assertEquals(CategoryId("dairy"), catalog.suggestedCategory("WHOLE MILK"))
    }
}
