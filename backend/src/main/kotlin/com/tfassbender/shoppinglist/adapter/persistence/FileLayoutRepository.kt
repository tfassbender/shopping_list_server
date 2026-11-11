package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.FavoritesRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserFavorites
import com.tfassbender.shoppinglist.domain.user.UserId
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant

/** Stores `spaces/<spaceId>/layouts/<layoutId>.json`. */
class FileLayoutRepository(private val files: JsonFiles) : LayoutRepository {

    override fun findById(spaceId: SpaceId, layoutId: LayoutId): ShopLayout? =
        files.read(file(spaceId, layoutId), LayoutFile::class.java)?.toDomain()

    override fun findBySpace(spaceId: SpaceId): List<ShopLayout> =
        files.jsonFiles(dir(spaceId)).mapNotNull { files.read(it, LayoutFile::class.java)?.toDomain() }

    override fun save(layout: ShopLayout) {
        files.write(file(layout.spaceId, layout.id), LayoutFile.fromDomain(layout))
    }

    override fun delete(spaceId: SpaceId, layoutId: LayoutId) {
        Files.deleteIfExists(file(spaceId, layoutId))
    }

    private fun dir(spaceId: SpaceId): Path = files.spaceDir(spaceId.value).resolve("layouts")
    private fun file(spaceId: SpaceId, layoutId: LayoutId): Path = dir(spaceId).resolve("${JsonFiles.safeSegment(layoutId.value)}.json")
}

data class LayoutFile(
    val schemaVersion: Int = 1,
    val id: String,
    val spaceId: String,
    val name: String,
    val mode: String,
    val categoryOrder: List<String> = emptyList(),
    val itemOrder: List<String> = emptyList(),
    val listIds: List<String> = emptyList(),
    val createdAt: Instant,
    val seq: Long = 0,
) {
    fun toDomain() = ShopLayout(
        id = LayoutId(id),
        spaceId = SpaceId(spaceId),
        name = name,
        mode = LayoutMode.valueOf(mode),
        categoryOrder = categoryOrder.map(::CategoryId),
        itemOrder = itemOrder,
        listIds = listIds.map(::ListId).toSet(),
        createdAt = createdAt,
        seq = seq,
    )

    companion object {
        fun fromDomain(layout: ShopLayout) = LayoutFile(
            id = layout.id.value,
            spaceId = layout.spaceId.value,
            name = layout.name,
            mode = layout.mode.name,
            categoryOrder = layout.categoryOrder.map { it.value },
            itemOrder = layout.itemOrder,
            listIds = layout.listIds.map { it.value }.sorted(),
            createdAt = layout.createdAt,
            seq = layout.seq,
        )
    }
}

/** Stores `users/<userId>/favorites.json` (personal, deleted with the account). */
class FileFavoritesRepository(private val files: JsonFiles) : FavoritesRepository {

    data class FavoritesFile(val schemaVersion: Int = 1, val layouts: Map<String, List<String>> = emptyMap())

    override fun find(userId: UserId): UserFavorites {
        val file = files.read(file(userId), FavoritesFile::class.java) ?: return UserFavorites(userId)
        return UserFavorites(userId, file.layouts.map { (layout, names) -> LayoutId(layout) to names.toSet() }.toMap())
    }

    override fun save(favorites: UserFavorites) {
        val content = FavoritesFile(layouts = favorites.byLayout.map { (layout, names) -> layout.value to names.sorted() }.toMap())
        files.write(file(favorites.userId), content)
    }

    private fun file(userId: UserId): Path = files.userDir(userId.value).resolve("favorites.json")
}
