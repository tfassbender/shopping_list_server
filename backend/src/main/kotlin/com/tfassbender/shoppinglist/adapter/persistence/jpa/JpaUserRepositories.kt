package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserApiTokens
import com.tfassbender.shoppinglist.domain.user.UserId
import io.quarkus.narayana.jta.QuarkusTransaction
import jakarta.persistence.EntityManager

/**
 * Every repository method runs in a transaction and joins the one of a surrounding `SpaceLocks` operation.
 * Domain objects are built inside it, so lazy collections are loaded before the transaction ends.
 */
internal fun <T> inTransaction(action: () -> T): T = QuarkusTransaction.joiningExisting().call(action)

class JpaUserRepository(private val em: EntityManager) : UserRepository {

    override fun findById(id: UserId): User? = inTransaction { em.find(UserEntity::class.java, id.value)?.toDomain() }

    override fun findByEmail(email: Email): User? = findBy("email", email.value)

    override fun findByVerificationTokenHash(hash: String): User? = findBy("emailVerificationHash", hash)

    override fun findByPasswordResetTokenHash(hash: String): User? = findBy("passwordResetHash", hash)

    override fun findAllByIds(ids: Collection<UserId>): List<User> = inTransaction {
        if (ids.isEmpty()) return@inTransaction emptyList()
        em.createQuery("select u from UserEntity u where u.id in :ids", UserEntity::class.java)
            .setParameter("ids", ids.map { it.value })
            .resultList.map { it.toDomain() }
    }

    override fun save(user: User) {
        // merge = insert or update: the entity is copied onto the managed instance with the same id.
        inTransaction { em.merge(UserEntity.fromDomain(user)) }
    }

    /** The API tokens go with the user (ON DELETE CASCADE in the schema). */
    override fun delete(id: UserId) {
        inTransaction {
            em.find(UserEntity::class.java, id.value)?.let(em::remove)
            em.flush()
            // The database cascade bypasses Hibernate; forget loaded token rows of the user.
            em.clear()
        }
    }

    // `field` is one of the fixed property names above, never user input.
    private fun findBy(field: String, value: String): User? = inTransaction {
        em.createQuery("select u from UserEntity u where u.$field = :value", UserEntity::class.java)
            .setParameter("value", value)
            .resultList.firstOrNull()?.toDomain()
    }
}

class JpaApiTokenRepository(private val em: EntityManager) : ApiTokenRepository {

    override fun find(userId: UserId): UserApiTokens = inTransaction {
        UserApiTokens(userId, tokensOf(userId).map { it.toDomain() })
    }

    /** Updates tokens in place by id, inserts new ones and deletes the ones that are gone (revoked). */
    override fun save(tokens: UserApiTokens) {
        inTransaction {
            val existing = tokensOf(tokens.userId).associateBy { it.id }
            tokens.tokens.forEachIndexed { position, token ->
                val entity = existing[token.id.value]
                if (entity == null) em.persist(ApiTokenEntity.fromDomain(tokens.userId, token, position)) else entity.updateFrom(token, position)
            }
            val kept = tokens.tokens.map { it.id.value }.toSet()
            existing.values.filter { it.id !in kept }.forEach(em::remove)
        }
    }

    private fun tokensOf(userId: UserId): List<ApiTokenEntity> =
        em.createQuery("select t from ApiTokenEntity t where t.userId = :userId order by t.position", ApiTokenEntity::class.java)
            .setParameter("userId", userId.value)
            .resultList
}
