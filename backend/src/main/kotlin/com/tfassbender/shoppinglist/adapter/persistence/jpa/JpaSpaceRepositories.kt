package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.list.SyncState
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.persistence.EntityManager

/*
 * Repositories of the space data. Saving follows one pattern: load the managed root entity (or create
 * it), then bring it to the state of the domain aggregate with `updateFrom` - Hibernate writes only the
 * rows that changed when the transaction commits.
 */

class JpaSpaceRepository(private val em: EntityManager) : SpaceRepository {

    override fun findById(id: SpaceId): Space? = inTransaction { em.find(SpaceEntity::class.java, id.value)?.toDomain() }

    override fun findByMember(userId: UserId): List<Space> = inTransaction {
        em.createQuery("select distinct s from SpaceEntity s join s.members m where m.userId = :userId", SpaceEntity::class.java)
            .setParameter("userId", userId.value)
            .resultList.map { it.toDomain() }
    }

    override fun findByInviteTokenHash(hash: String): Space? = inTransaction {
        em.createQuery("select s from SpaceEntity s join s.invites i where i.tokenHash = :hash", SpaceEntity::class.java)
            .setParameter("hash", hash)
            .resultList.firstOrNull()?.toDomain()
    }

    override fun save(space: Space) {
        inTransaction {
            val entity = em.find(SpaceEntity::class.java, space.id.value)
            if (entity == null) em.persist(SpaceEntity.fromDomain(space)) else entity.updateFrom(space)
        }
    }

    /** Lists, layouts, catalog and sync state go with the space (ON DELETE CASCADE in the schema). */
    override fun delete(id: SpaceId) {
        inTransaction {
            em.find(SpaceEntity::class.java, id.value)?.let(em::remove)
            em.flush()
            // The database cascade bypasses Hibernate; forget loaded entities of the deleted space.
            em.clear()
        }
    }
}

class JpaCatalogRepository(private val em: EntityManager) : CatalogRepository {

    override fun find(spaceId: SpaceId): SpaceCatalog =
        inTransaction { em.find(CatalogEntity::class.java, spaceId.value)?.toDomain() ?: SpaceCatalog(spaceId) }

    override fun save(catalog: SpaceCatalog) {
        inTransaction {
            val entity = em.find(CatalogEntity::class.java, catalog.spaceId.value)
            if (entity == null) em.persist(CatalogEntity.fromDomain(catalog)) else entity.updateFrom(catalog)
        }
    }
}

class JpaShoppingListRepository(private val em: EntityManager) : ShoppingListRepository {

    override fun findById(spaceId: SpaceId, listId: ListId): ShoppingList? = inTransaction { entity(spaceId, listId.value)?.toDomain() }

    /** Fetches the items in the same query; their stamps are loaded in batches (Hibernate batch fetching). */
    override fun findBySpace(spaceId: SpaceId): List<ShoppingList> = inTransaction {
        em.createQuery(
            "select distinct l from ShoppingListEntity l left join fetch l.items where l.spaceId = :spaceId order by l.listId",
            ShoppingListEntity::class.java,
        ).setParameter("spaceId", spaceId.value).resultList.map { it.toDomain() }
    }

    override fun save(list: ShoppingList) {
        inTransaction {
            val entity = entity(list.spaceId, list.id.value)
            if (entity == null) em.persist(ShoppingListEntity.fromDomain(list)) else entity.updateFrom(list)
        }
    }

    private fun entity(spaceId: SpaceId, listId: String): ShoppingListEntity? =
        em.createQuery("select l from ShoppingListEntity l where l.spaceId = :spaceId and l.listId = :listId", ShoppingListEntity::class.java)
            .setParameter("spaceId", spaceId.value)
            .setParameter("listId", listId)
            .resultList.firstOrNull()
}

class JpaLayoutRepository(private val em: EntityManager) : LayoutRepository {

    override fun findById(spaceId: SpaceId, layoutId: LayoutId): ShopLayout? = inTransaction { entity(spaceId, layoutId)?.toDomain() }

    override fun findBySpace(spaceId: SpaceId): List<ShopLayout> = inTransaction {
        em.createQuery("select l from ShopLayoutEntity l where l.spaceId = :spaceId order by l.layoutId", ShopLayoutEntity::class.java)
            .setParameter("spaceId", spaceId.value)
            .resultList.map { it.toDomain() }
    }

    override fun save(layout: ShopLayout) {
        inTransaction {
            val entity = entity(layout.spaceId, layout.id)
            if (entity == null) em.persist(ShopLayoutEntity.fromDomain(layout)) else entity.updateFrom(layout)
        }
    }

    override fun delete(spaceId: SpaceId, layoutId: LayoutId) {
        inTransaction { entity(spaceId, layoutId)?.let(em::remove) }
    }

    private fun entity(spaceId: SpaceId, layoutId: LayoutId): ShopLayoutEntity? =
        em.createQuery("select l from ShopLayoutEntity l where l.spaceId = :spaceId and l.layoutId = :layoutId", ShopLayoutEntity::class.java)
            .setParameter("spaceId", spaceId.value)
            .setParameter("layoutId", layoutId.value)
            .resultList.firstOrNull()
}

/** Callers hold the space lock, so a plain read-increment-write is safe (single instance). */
class JpaSequenceCounter(private val em: EntityManager) : SequenceCounter {

    override fun next(spaceId: SpaceId): Long = inTransaction {
        val entity = em.find(SpaceSequenceEntity::class.java, spaceId.value)
            ?: SpaceSequenceEntity(spaceId.value, 0).also(em::persist)
        entity.value += 1
        entity.value
    }

    override fun current(spaceId: SpaceId): Long = inTransaction { em.find(SpaceSequenceEntity::class.java, spaceId.value)?.value ?: 0 }
}

class JpaSyncStateRepository(private val em: EntityManager) : SyncStateRepository {

    override fun find(spaceId: SpaceId): SyncState =
        inTransaction { em.find(SyncStateEntity::class.java, spaceId.value)?.toDomain() ?: SyncState(spaceId) }

    override fun save(state: SyncState) {
        inTransaction {
            val entity = em.find(SyncStateEntity::class.java, state.spaceId.value)
                ?: SyncStateEntity(state.spaceId.value, 0).also(em::persist)
            entity.updateFrom(state)
        }
    }
}
