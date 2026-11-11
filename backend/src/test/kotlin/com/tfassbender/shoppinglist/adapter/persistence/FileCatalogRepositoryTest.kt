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

        repository.save(catalog)

        assertEquals(catalog, repository.find(SpaceId("s")))
    }
}
