package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.Item
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId
import java.nio.file.Path
import java.time.Instant

/** Stores `spaces/<spaceId>/lists/<listId>.json`. */
class FileShoppingListRepository(private val files: JsonFiles) : ShoppingListRepository {

    override fun findById(spaceId: SpaceId, listId: ListId): ShoppingList? =
        files.read(listFile(spaceId, listId.value), ListFile::class.java)?.toDomain()

    override fun findBySpace(spaceId: SpaceId): List<ShoppingList> =
        files.jsonFiles(listsDir(spaceId)).mapNotNull { files.read(it, ListFile::class.java)?.toDomain() }

    override fun save(list: ShoppingList) {
        files.write(listFile(list.spaceId, list.id.value), ListFile.fromDomain(list))
    }

    private fun listsDir(spaceId: SpaceId): Path = files.spaceDir(spaceId.value).resolve("lists")
    private fun listFile(spaceId: SpaceId, listId: String): Path = listsDir(spaceId).resolve("${JsonFiles.safeSegment(listId)}.json")
}

/** Stores the counter in `spaces/<spaceId>/sequence.json`. Callers hold the space lock. */
class FileSequenceCounter(private val files: JsonFiles) : SequenceCounter {

    data class SequenceFile(val schemaVersion: Int = 1, val value: Long = 0)

    override fun next(spaceId: SpaceId): Long {
        val next = current(spaceId) + 1
        files.write(file(spaceId), SequenceFile(value = next))
        return next
    }

    override fun current(spaceId: SpaceId): Long = files.read(file(spaceId), SequenceFile::class.java)?.value ?: 0

    private fun file(spaceId: SpaceId): Path = files.spaceDir(spaceId.value).resolve("sequence.json")
}

data class ItemFile(
    val id: String,
    val name: String,
    val quantity: String? = null,
    val unit: String? = null,
    val note: String? = null,
    val categoryId: String? = null,
    val checked: Boolean = false,
    val deleted: Boolean = false,
    val createdAt: Instant,
    val seq: Long,
) {
    fun toDomain() = Item(ItemId(id), name, quantity, unit, note, categoryId?.let(::CategoryId), checked, deleted, createdAt, seq)

    companion object {
        fun fromDomain(item: Item) = ItemFile(
            item.id.value, item.name, item.quantity, item.unit, item.note, item.categoryId?.value,
            item.checked, item.deleted, item.createdAt, item.seq,
        )
    }
}

data class ListFile(
    val schemaVersion: Int = 1,
    val id: String,
    val spaceId: String,
    val name: String,
    val createdAt: Instant,
    val seq: Long,
    val deleted: Boolean = false,
    val items: List<ItemFile> = emptyList(),
) {
    fun toDomain() = ShoppingList(ListId(id), SpaceId(spaceId), name, items.map { it.toDomain() }, createdAt, seq, deleted)

    companion object {
        fun fromDomain(list: ShoppingList) = ListFile(
            id = list.id.value,
            spaceId = list.spaceId.value,
            name = list.name,
            createdAt = list.createdAt,
            seq = list.seq,
            deleted = list.deleted,
            items = list.items.map(ItemFile::fromDomain),
        )
    }
}
