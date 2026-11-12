package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.Item
import com.tfassbender.shoppinglist.domain.list.ItemAspect
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.list.Stamp
import com.tfassbender.shoppinglist.domain.list.SyncState
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.persistence.CascadeType
import jakarta.persistence.CollectionTable
import jakarta.persistence.Column
import jakarta.persistence.ElementCollection
import jakarta.persistence.Embeddable
import jakarta.persistence.Entity
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.MapKeyColumn
import jakarta.persistence.OneToMany
import jakarta.persistence.OrderBy
import jakarta.persistence.OrderColumn
import jakarta.persistence.Table
import java.time.Instant

@Embeddable
data class StampEmbeddable(var seq: Long, var byUser: String?) {
    fun toDomain() = Stamp(seq, byUser?.let(::UserId))

    companion object {
        fun fromDomain(stamp: Stamp) = StampEmbeddable(stamp.seq, stamp.by?.value)
    }
}

/**
 * Table `shopping_lists`. Items are real entities (not an element collection) because each item owns a
 * collection of its own - the merge stamps. Domain ids are unique per space only, so the tables use a
 * surrogate key ([pk]) and a unique constraint on the natural key (space id + list id).
 */
@Entity
@Table(name = "shopping_lists")
class ShoppingListEntity(
    var spaceId: String,
    var listId: String,
    var name: String,
    var createdAt: Instant,
    var seq: Long,
    var deleted: Boolean,
    var deletedAt: Instant?,
    var nameStampSeq: Long?,
    var nameStampBy: String?,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var pk: Long? = null

    @OneToMany(mappedBy = "list", cascade = [CascadeType.ALL], orphanRemoval = true)
    @OrderBy("position")
    var items: MutableList<ItemEntity> = mutableListOf()

    /**
     * Brings this (managed) entity to the state of [list]. Items are matched by their domain id and updated
     * in place: replacing them with new entity instances would make Hibernate insert the new rows before
     * deleting the old ones, which breaks the unique (list, item id) constraint.
     */
    fun updateFrom(list: ShoppingList) {
        name = list.name
        createdAt = list.createdAt
        seq = list.seq
        deleted = list.deleted
        deletedAt = list.deletedAt
        nameStampSeq = list.nameStamp?.seq
        nameStampBy = list.nameStamp?.by?.value
        val existing = items.associateBy { it.itemId }
        val updated = list.items.mapIndexed { position, item ->
            (existing[item.id.value] ?: ItemEntity(this, item.id.value)).apply { updateFrom(item, position) }
        }
        items.syncWith(updated)
    }

    fun toDomain() = ShoppingList(
        id = ListId(listId),
        spaceId = SpaceId(spaceId),
        name = name,
        items = items.map { it.toDomain() },
        createdAt = createdAt,
        seq = seq,
        deleted = deleted,
        nameStamp = nameStampSeq?.let { Stamp(it, nameStampBy?.let(::UserId)) },
        deletedAt = deletedAt,
    )

    companion object {
        fun fromDomain(list: ShoppingList) = ShoppingListEntity(
            list.spaceId.value, list.id.value, list.name, list.createdAt, list.seq, list.deleted, list.deletedAt, null, null,
        ).apply { updateFrom(list) }
    }
}

/** Table `items` with the merge stamps in `item_stamps` (one row per aspect). */
@Entity
@Table(name = "items")
class ItemEntity(
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "list_pk")
    var list: ShoppingListEntity,
    var itemId: String,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var pk: Long? = null

    var position: Int = 0
    var name: String = ""
    var quantity: String? = null
    var unit: String? = null
    var note: String? = null
    var categoryId: String? = null
    var checked: Boolean = false
    var deleted: Boolean = false
    var deletedAt: Instant? = null
    var createdAt: Instant = Instant.EPOCH
    var seq: Long = 0

    @ElementCollection
    @CollectionTable(name = "item_stamps", joinColumns = [JoinColumn(name = "item_pk")])
    @MapKeyColumn(name = "aspect")
    var stamps: MutableMap<String, StampEmbeddable> = mutableMapOf()

    fun updateFrom(item: Item, position: Int) {
        this.position = position
        name = item.name
        quantity = item.quantity
        unit = item.unit
        note = item.note
        categoryId = item.categoryId?.value
        checked = item.checked
        deleted = item.deleted
        deletedAt = item.deletedAt
        createdAt = item.createdAt
        seq = item.seq
        stamps.syncWith(item.stamps.entries.associate { (aspect, stamp) -> aspect.name to StampEmbeddable.fromDomain(stamp) })
    }

    fun toDomain() = Item(
        id = ItemId(itemId),
        name = name,
        quantity = quantity,
        unit = unit,
        note = note,
        categoryId = categoryId?.let(::CategoryId),
        checked = checked,
        deleted = deleted,
        createdAt = createdAt,
        seq = seq,
        stamps = stamps.entries.associate { (aspect, stamp) -> ItemAspect.valueOf(aspect) to stamp.toDomain() },
        deletedAt = deletedAt,
    )
}

/** Tables `shop_layouts`, `layout_category_order`, `layout_item_order`, `layout_lists`. */
@Entity
@Table(name = "shop_layouts")
class ShopLayoutEntity(
    var spaceId: String,
    var layoutId: String,
    var name: String,
    var mode: String,
    var createdAt: Instant,
    var seq: Long,
) {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var pk: Long? = null

    @ElementCollection
    @CollectionTable(name = "layout_category_order", joinColumns = [JoinColumn(name = "layout_pk")])
    @OrderColumn(name = "position")
    @Column(name = "category_id")
    var categoryOrder: MutableList<String> = mutableListOf()

    @ElementCollection
    @CollectionTable(name = "layout_item_order", joinColumns = [JoinColumn(name = "layout_pk")])
    @OrderColumn(name = "position")
    @Column(name = "name")
    var itemOrder: MutableList<String> = mutableListOf()

    @ElementCollection
    @CollectionTable(name = "layout_lists", joinColumns = [JoinColumn(name = "layout_pk")])
    @Column(name = "list_id")
    var listIds: MutableSet<String> = mutableSetOf()

    fun updateFrom(layout: ShopLayout) {
        name = layout.name
        mode = layout.mode.name
        createdAt = layout.createdAt
        seq = layout.seq
        categoryOrder.syncWith(layout.categoryOrder.map { it.value })
        itemOrder.syncWith(layout.itemOrder)
        listIds.syncWith(layout.listIds.map { it.value }.toSet())
    }

    fun toDomain() = ShopLayout(
        id = LayoutId(layoutId),
        spaceId = SpaceId(spaceId),
        name = name,
        mode = LayoutMode.valueOf(mode),
        categoryOrder = categoryOrder.map(::CategoryId),
        itemOrder = itemOrder.toList(),
        listIds = listIds.map(::ListId).toSet(),
        createdAt = createdAt,
        seq = seq,
    )

    companion object {
        fun fromDomain(layout: ShopLayout) = ShopLayoutEntity(
            layout.spaceId.value, layout.id.value, layout.name, layout.mode.name, layout.createdAt, layout.seq,
        ).apply { updateFrom(layout) }
    }
}

/** Table `space_sequences`: the per-space sequence counter behind the `SequenceCounter` port. */
@Entity
@Table(name = "space_sequences")
class SpaceSequenceEntity(
    @Id var spaceId: String,
    var value: Long,
)

/** Tables `sync_states` and `sync_applied_changes` (processed change id -> when). */
@Entity
@Table(name = "sync_states")
class SyncStateEntity(
    @Id var spaceId: String,
    var purgedSeq: Long,
) {
    @ElementCollection
    @CollectionTable(name = "sync_applied_changes", joinColumns = [JoinColumn(name = "space_id")])
    @MapKeyColumn(name = "change_id")
    @Column(name = "applied_at")
    var appliedChanges: MutableMap<String, Instant> = mutableMapOf()

    fun updateFrom(state: SyncState) {
        purgedSeq = state.purgedSeq
        appliedChanges.syncWith(state.appliedChanges)
    }

    fun toDomain() = SyncState(SpaceId(spaceId), purgedSeq, appliedChanges.toMap())
}
