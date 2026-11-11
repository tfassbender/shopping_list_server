package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.locks.ReentrantLock
import kotlin.concurrent.withLock

/**
 * One in-process lock per space around load-modify-save, so concurrent requests on the same space can't
 * overwrite each other's changes (single-instance deployment). Reentrant: a locked operation may call
 * another one on the same space.
 */
@ApplicationScoped
class SpaceLocks {
    private val locks = ConcurrentHashMap<SpaceId, ReentrantLock>()

    fun <T> withLock(spaceId: SpaceId, action: () -> T): T =
        locks.computeIfAbsent(spaceId) { ReentrantLock() }.withLock(action)
}

/**
 * The central permission check used by all services working inside a space. Non-members get a 404, so
 * the existence of foreign spaces isn't revealed; members calling owner-only operations get a 403.
 */
@ApplicationScoped
class SpaceAccess(private val spaces: SpaceRepository) {

    fun requireMember(spaceId: SpaceId, userId: UserId): Space {
        val space = spaces.findById(spaceId)
        if (space == null || !space.isMember(userId)) {
            throw DomainException(ErrorKind.NOT_FOUND, "SPACE_NOT_FOUND", "No space ${spaceId.value}")
        }
        return space
    }

    fun requireOwner(spaceId: SpaceId, userId: UserId): Space {
        val space = requireMember(spaceId, userId)
        if (!space.isOwner(userId)) {
            throw DomainException(ErrorKind.FORBIDDEN, "OWNER_ONLY", "Only the owner of the space may do this")
        }
        return space
    }
}
