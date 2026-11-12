package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.space.Category
import com.tfassbender.shoppinglist.domain.space.HistoryEntry
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Member
import com.tfassbender.shoppinglist.domain.space.Role
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.persistence.CollectionTable
import jakarta.persistence.Column
import jakarta.persistence.ElementCollection
import jakarta.persistence.Embeddable
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.MapKeyColumn
import jakarta.persistence.OrderColumn
import jakarta.persistence.Table
import java.time.Instant

/*
 * Space and catalog. Their parts have no identity of their own in the database (members, invites,
 * categories, units, history entries), so they are element collections of the root entity: Hibernate
 * stores them in child tables and deletes/updates the rows when the collection changes.
 * Embeddables are data classes, so Hibernate can tell changed rows from unchanged ones by equality.
 */

@Embeddable
data class MemberEmbeddable(var userId: String, var role: String, var joinedAt: Instant) {
    fun toDomain() = Member(UserId(userId), Role.valueOf(role), joinedAt)

    companion object {
        fun fromDomain(member: Member) = MemberEmbeddable(member.userId.value, member.role.name, member.joinedAt)
    }
}

@Embeddable
data class InviteEmbeddable(
    var id: String,
    var tokenHash: String,
    var createdBy: String,
    var createdAt: Instant,
    var expiresAt: Instant,
) {
    fun toDomain() = Invite(InviteId(id), tokenHash, UserId(createdBy), createdAt, expiresAt)

    companion object {
        fun fromDomain(invite: Invite) =
            InviteEmbeddable(invite.id.value, invite.tokenHash, invite.createdBy.value, invite.createdAt, invite.expiresAt)
    }
}

/** Tables `spaces`, `space_members`, `space_invites`. */
@Entity
@Table(name = "spaces")
class SpaceEntity(
    @Id var id: String,
    var name: String,
    var createdAt: Instant,
) {
    @ElementCollection
    @CollectionTable(name = "space_members", joinColumns = [JoinColumn(name = "space_id")])
    @OrderColumn(name = "position")
    var members: MutableList<MemberEmbeddable> = mutableListOf()

    @ElementCollection
    @CollectionTable(name = "space_invites", joinColumns = [JoinColumn(name = "space_id")])
    @OrderColumn(name = "position")
    var invites: MutableList<InviteEmbeddable> = mutableListOf()

    fun updateFrom(space: Space) {
        name = space.name
        createdAt = space.createdAt
        members.syncWith(space.members.map(MemberEmbeddable::fromDomain))
        invites.syncWith(space.invites.map(InviteEmbeddable::fromDomain))
    }

    fun toDomain() = Space(
        id = SpaceId(id),
        name = name,
        members = members.map { it.toDomain() },
        invites = invites.map { it.toDomain() },
        createdAt = createdAt,
    )

    companion object {
        fun fromDomain(space: Space) = SpaceEntity(space.id.value, space.name, space.createdAt).apply { updateFrom(space) }
    }
}

@Embeddable
data class CategoryEmbeddable(var id: String, var name: String, var color: String) {
    fun toDomain() = Category(CategoryId(id), name, color)

    companion object {
        fun fromDomain(category: Category) = CategoryEmbeddable(category.id.value, category.name, category.color)
    }
}

@Embeddable
data class HistoryEmbeddable(
    var name: String,
    var categoryId: String?,
    var unit: String?,
    var usageCount: Int,
    var lastUsed: Instant,
    var seq: Long,
) {
    fun toDomain() = HistoryEntry(name, categoryId?.let(::CategoryId), unit, usageCount, lastUsed, seq)

    companion object {
        fun fromDomain(entry: HistoryEntry) =
            HistoryEmbeddable(entry.name, entry.categoryId?.value, entry.unit, entry.usageCount, entry.lastUsed, entry.seq)
    }
}

/** Tables `catalogs`, `catalog_categories`, `catalog_units`, `item_history` (keyed by normalized name). */
@Entity
@Table(name = "catalogs")
class CatalogEntity(
    @Id var spaceId: String,
    var seq: Long,
) {
    @ElementCollection
    @CollectionTable(name = "catalog_categories", joinColumns = [JoinColumn(name = "space_id")])
    @OrderColumn(name = "position")
    var categories: MutableList<CategoryEmbeddable> = mutableListOf()

    @ElementCollection
    @CollectionTable(name = "catalog_units", joinColumns = [JoinColumn(name = "space_id")])
    @OrderColumn(name = "position")
    @Column(name = "unit")
    var units: MutableList<String> = mutableListOf()

    @ElementCollection
    @CollectionTable(name = "item_history", joinColumns = [JoinColumn(name = "space_id")])
    @MapKeyColumn(name = "normalized_name")
    var history: MutableMap<String, HistoryEmbeddable> = mutableMapOf()

    fun updateFrom(catalog: SpaceCatalog) {
        seq = catalog.seq
        categories.syncWith(catalog.categories.map(CategoryEmbeddable::fromDomain))
        units.syncWith(catalog.units)
        history.syncWith(catalog.history.mapValues { HistoryEmbeddable.fromDomain(it.value) })
    }

    fun toDomain() = SpaceCatalog(
        spaceId = SpaceId(spaceId),
        categories = categories.map { it.toDomain() },
        units = units.toList(),
        history = history.mapValues { it.value.toDomain() },
        seq = seq,
    )

    companion object {
        fun fromDomain(catalog: SpaceCatalog) = CatalogEntity(catalog.spaceId.value, catalog.seq).apply { updateFrom(catalog) }
    }
}

/**
 * Replaces the content of a managed list in place. Keeping the collection instance matters: Hibernate
 * tracks changes on its own collection wrapper, and only the rows that differ are written.
 */
internal fun <T> MutableList<T>.syncWith(values: List<T>) {
    if (this == values) return
    clear()
    addAll(values)
}

/** Map counterpart of [syncWith]: removes, updates and adds only the entries that changed. */
internal fun <K, V> MutableMap<K, V>.syncWith(values: Map<K, V>) {
    keys.retainAll(values.keys)
    values.forEach { (key, value) -> if (this[key] != value) this[key] = value }
}

/** Set counterpart of [syncWith]. */
internal fun <T> MutableSet<T>.syncWith(values: Set<T>) {
    retainAll(values)
    addAll(values)
}
