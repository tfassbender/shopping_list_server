package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.space.Category
import com.tfassbender.shoppinglist.domain.space.HistoryEntry
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import java.nio.file.Path
import java.time.Instant

/** Stores `spaces/<spaceId>/catalog.json`. */
class FileCatalogRepository(private val files: JsonFiles) : CatalogRepository {

    override fun find(spaceId: SpaceId): SpaceCatalog =
        files.read(file(spaceId), CatalogFile::class.java)?.toDomain(spaceId) ?: SpaceCatalog(spaceId)

    override fun save(catalog: SpaceCatalog) {
        files.write(file(catalog.spaceId), CatalogFile.fromDomain(catalog))
    }

    private fun file(spaceId: SpaceId): Path = files.spaceDir(spaceId.value).resolve("catalog.json")
}

data class CategoryFile(val id: String, val name: String, val color: String)

data class HistoryFile(val name: String, val categoryId: String?, val unit: String?, val usageCount: Int, val lastUsed: Instant)

data class CatalogFile(
    val schemaVersion: Int = 1,
    val categories: List<CategoryFile> = emptyList(),
    val units: List<String> = emptyList(),
    val history: List<HistoryFile> = emptyList(),
) {
    fun toDomain(spaceId: SpaceId) = SpaceCatalog(
        spaceId = spaceId,
        categories = categories.map { Category(CategoryId(it.id), it.name, it.color) },
        units = units,
        history = history.associate {
            SpaceCatalog.normalize(it.name) to HistoryEntry(it.name, it.categoryId?.let(::CategoryId), it.unit, it.usageCount, it.lastUsed)
        },
    )

    companion object {
        fun fromDomain(catalog: SpaceCatalog) = CatalogFile(
            categories = catalog.categories.map { CategoryFile(it.id.value, it.name, it.color) },
            units = catalog.units,
            history = catalog.history.values.sortedBy { it.name.lowercase() }
                .map { HistoryFile(it.name, it.categoryId?.value, it.unit, it.usageCount, it.lastUsed) },
        )
    }
}
