package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.auth.SecretTokens
import com.tfassbender.shoppinglist.application.auth.UserLocks
import com.tfassbender.shoppinglist.application.port.SpaceChangeNotifier
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Member
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.time.Duration
import java.util.UUID

/** A member with the display name resolved (members only see each other's display names). */
data class MemberView(val member: Member, val displayName: String)

/** A freshly created invite with its raw token – the only time the token is available. */
data class CreatedInvite(val invite: Invite, val rawToken: String)

data class InvitePreview(val spaceName: String, val invitedBy: String, val alreadyMember: Boolean)

@ApplicationScoped
class SpaceService(
    private val spaces: SpaceRepository,
    private val users: UserRepository,
    private val access: SpaceAccess,
    private val locks: SpaceLocks,
    private val clock: Clock,
    private val catalog: CatalogService,
    private val notifier: SpaceChangeNotifier,
    private val userLocks: UserLocks,
) {

    fun create(userId: UserId, name: String): Space {
        val space = Space.create(SpaceId(UUID.randomUUID().toString()), name, userId, clock.instant())
        // One lock (and transaction) for the space and its catalog: no space without categories after a failure.
        locks.withLock(space.id) {
            spaces.save(space)
            // Default categories and units in the creator's language.
            catalog.createDefaults(space.id, users.findById(userId)?.settings?.language ?: Language.EN)
        }
        return space
    }

    /** The user's spaces in their own order (see [reorder]); spaces not ordered yet follow by name. */
    fun listMine(userId: UserId): List<Space> =
        inOrder(spaces.findByMember(userId), users.findById(userId)?.spaceOrder.orEmpty())

    /**
     * Stores the user's order of their spaces. Lenient on purpose: ids of spaces the user isn't a member of
     * (e.g. left on another device meanwhile) are dropped, and spaces missing in [order] (e.g. joined
     * meanwhile) simply come after the ordered ones.
     */
    fun reorder(userId: UserId, order: List<SpaceId>): List<Space> {
        val mine = spaces.findByMember(userId)
        val memberOf = mine.map { it.id.value }.toSet()
        val cleaned = order.map { it.value }.distinct().filter { it in memberOf }
        userLocks.withLock(userId) {
            val user = users.findById(userId) ?: throw DomainException(ErrorKind.NOT_FOUND, "USER_NOT_FOUND", "No user ${userId.value}")
            users.save(user.copy(spaceOrder = cleaned))
        }
        return inOrder(mine, cleaned)
    }

    private fun inOrder(spaces: List<Space>, order: List<String>): List<Space> {
        val position = order.withIndex().associate { it.value to it.index }
        return spaces.sortedWith(compareBy({ position[it.id.value] ?: Int.MAX_VALUE }, { it.name.lowercase() }))
    }

    fun get(userId: UserId, spaceId: SpaceId): Space = access.requireMember(spaceId, userId)

    fun rename(userId: UserId, spaceId: SpaceId, name: String): Space = modifyAsOwner(userId, spaceId) { it.rename(name) }

    fun delete(userId: UserId, spaceId: SpaceId) {
        val space = locks.withLock(spaceId) {
            val space = access.requireOwner(spaceId, userId)
            spaces.delete(spaceId)
            space
        }
        // All members' open screens (incl. the owner's other devices) should notice at once.
        notifier.accessLost(spaceId, space.members.map { it.userId })
    }

    fun members(userId: UserId, spaceId: SpaceId): List<MemberView> {
        val space = access.requireMember(spaceId, userId)
        val names = users.findAllByIds(space.members.map { it.userId }).associate { it.id to it.displayName }
        return space.members
            .sortedWith(compareBy({ it.role }, { it.joinedAt }))
            .map { MemberView(it, names[it.userId] ?: "?") }
    }

    fun createInvite(userId: UserId, spaceId: SpaceId, validFor: Duration = DEFAULT_INVITE_VALIDITY): CreatedInvite {
        if (validFor < MIN_INVITE_VALIDITY || validFor > MAX_INVITE_VALIDITY) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_EXPIRY", "Invite validity must be 1 hour to 30 days")
        }
        val rawToken = SecretTokens.newRawToken()
        val now = clock.instant()
        val invite = Invite(InviteId(UUID.randomUUID().toString()), SecretTokens.hash(rawToken), userId, now, now.plus(validFor))
        modifyAsOwner(userId, spaceId) { it.withoutExpiredInvites(now).addInvite(invite) }
        return CreatedInvite(invite, rawToken)
    }

    fun listInvites(userId: UserId, spaceId: SpaceId): List<Invite> {
        val now = clock.instant()
        return access.requireOwner(spaceId, userId).invites.filterNot { it.isExpiredAt(now) }.sortedBy { it.createdAt }
    }

    fun revokeInvite(userId: UserId, spaceId: SpaceId, inviteId: InviteId) {
        modifyAsOwner(userId, spaceId) { it.revokeInvite(inviteId) }
    }

    /** What the invite acceptance page shows before joining. */
    fun previewInvite(userId: UserId, rawToken: String): InvitePreview {
        val hash = SecretTokens.hash(rawToken)
        val space = spaces.findByInviteTokenHash(hash) ?: throw Space.invalidInvite()
        val invite = space.invites.first { it.tokenHash == hash }
        if (invite.isExpiredAt(clock.instant())) throw Space.invalidInvite()
        val inviter = users.findById(invite.createdBy)?.displayName ?: "?"
        return InvitePreview(space.name, inviter, space.isMember(userId))
    }

    fun acceptInvite(userId: UserId, rawToken: String): Space {
        val hash = SecretTokens.hash(rawToken)
        val spaceId = spaces.findByInviteTokenHash(hash)?.id ?: throw Space.invalidInvite()
        return locks.withLock(spaceId) {
            // Re-read under the lock: the invite may have been used in the meantime (single-use).
            val space = spaces.findById(spaceId) ?: throw Space.invalidInvite()
            val updated = space.acceptInvite(hash, userId, clock.instant())
            spaces.save(updated)
            updated
        }
    }

    fun removeMember(userId: UserId, spaceId: SpaceId, memberId: UserId): Space {
        val updated = modifyAsOwner(userId, spaceId) { it.removeMember(memberId) }
        notifier.accessLost(spaceId, listOf(memberId))
        return updated
    }

    fun leave(userId: UserId, spaceId: SpaceId) {
        locks.withLock(spaceId) {
            val space = access.requireMember(spaceId, userId)
            spaces.save(space.removeMember(userId))
        }
        // The user's other devices should drop the space too.
        notifier.accessLost(spaceId, listOf(userId))
    }

    fun transferOwnership(userId: UserId, spaceId: SpaceId, newOwner: UserId): Space =
        modifyAsOwner(userId, spaceId) { it.transferOwnership(newOwner) }

    private fun modifyAsOwner(userId: UserId, spaceId: SpaceId, change: (Space) -> Space): Space =
        locks.withLock(spaceId) {
            val updated = change(access.requireOwner(spaceId, userId))
            spaces.save(updated)
            updated
        }

    companion object {
        val DEFAULT_INVITE_VALIDITY: Duration = Duration.ofDays(1)
        val MIN_INVITE_VALIDITY: Duration = Duration.ofHours(1)
        val MAX_INVITE_VALIDITY: Duration = Duration.ofDays(30)
    }
}
