package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped

/**
 * Deletes an account (GDPR): owned spaces pass to the longest-standing member or are deleted when
 * nobody else is in them; memberships elsewhere are removed; then all personal data is deleted.
 */
@ApplicationScoped
class AccountDeletionService(
    private val users: UserRepository,
    private val spaces: SpaceRepository,
    private val locks: SpaceLocks,
) {
    fun deleteAccount(userId: UserId) {
        spaces.findByMember(userId).forEach { candidate ->
            locks.withLock(candidate.id) {
                val space = spaces.findById(candidate.id) ?: return@withLock
                when (val remaining = space.removeDeletedUser(userId)) {
                    null -> spaces.delete(space.id)
                    else -> spaces.save(remaining)
                }
            }
        }
        users.delete(userId)
    }
}
