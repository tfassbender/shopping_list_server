package com.tfassbender.shoppinglist.domain.space

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.user.UserId
import java.time.Instant

@JvmInline
value class SpaceId(val value: String)

@JvmInline
value class InviteId(val value: String)

enum class Role { OWNER, MEMBER }

data class Member(val userId: UserId, val role: Role, val joinedAt: Instant)

/** A single-use invite link. Only the hash of the token is kept; the raw token is shown once. */
data class Invite(
    val id: InviteId,
    val tokenHash: String,
    val createdBy: UserId,
    val createdAt: Instant,
    val expiresAt: Instant,
) {
    fun isExpiredAt(now: Instant): Boolean = now.isAfter(expiresAt)
}

/**
 * The unit of sharing: lists, layouts and the catalog belong to a space. Enforces the membership rules –
 * exactly one owner, the owner can't leave without handing over, invites are single-use and expire.
 * Who may call which operation (owner vs. member) is checked by the application services.
 */
data class Space(
    val id: SpaceId,
    val name: String,
    val members: List<Member>,
    val invites: List<Invite>,
    val createdAt: Instant,
) {
    init {
        validateName(name)
        require(members.count { it.role == Role.OWNER } == 1) { "A space needs exactly one owner" }
        require(members.distinctBy { it.userId }.size == members.size) { "Duplicate member" }
    }

    val owner: Member get() = members.single { it.role == Role.OWNER }

    fun memberOrNull(userId: UserId): Member? = members.firstOrNull { it.userId == userId }
    fun isMember(userId: UserId): Boolean = memberOrNull(userId) != null
    fun isOwner(userId: UserId): Boolean = owner.userId == userId

    fun rename(newName: String): Space = copy(name = newName.trim())

    fun addInvite(invite: Invite): Space = copy(invites = invites + invite)

    fun revokeInvite(inviteId: InviteId): Space {
        if (invites.none { it.id == inviteId }) {
            throw DomainException(ErrorKind.NOT_FOUND, "INVITE_NOT_FOUND", "No invite ${inviteId.value}")
        }
        return copy(invites = invites.filterNot { it.id == inviteId })
    }

    /** Drops expired invites; they are useless and would only clutter the file. */
    fun withoutExpiredInvites(now: Instant): Space = copy(invites = invites.filterNot { it.isExpiredAt(now) })

    /** Joins via an invite; the invite is consumed (single-use). */
    fun acceptInvite(tokenHash: String, userId: UserId, now: Instant): Space {
        val invite = invites.firstOrNull { it.tokenHash == tokenHash && !it.isExpiredAt(now) }
            ?: throw invalidInvite()
        if (isMember(userId)) {
            // The invite stays valid, so it can still be passed on to the intended person.
            throw DomainException(ErrorKind.CONFLICT, "ALREADY_MEMBER", "Already a member of this space")
        }
        return copy(
            members = members + Member(userId, Role.MEMBER, now),
            invites = invites - invite,
        )
    }

    fun removeMember(userId: UserId): Space {
        val member = memberOrNull(userId) ?: throw notAMember()
        if (member.role == Role.OWNER) {
            throw DomainException(ErrorKind.CONFLICT, "OWNER_CANNOT_LEAVE", "The owner must hand over ownership first")
        }
        return copy(members = members - member)
    }

    fun transferOwnership(newOwner: UserId): Space {
        if (!isMember(newOwner)) throw notAMember()
        if (isOwner(newOwner)) return this
        return copy(
            members = members.map {
                when {
                    it.userId == newOwner -> it.copy(role = Role.OWNER)
                    it.role == Role.OWNER -> it.copy(role = Role.MEMBER)
                    else -> it
                }
            },
        )
    }

    /**
     * Removes a user whose account is deleted. An owner's space passes to the longest-standing member;
     * returns null if nobody is left (the space must be deleted).
     */
    fun removeDeletedUser(userId: UserId): Space? {
        if (!isMember(userId)) return this
        if (!isOwner(userId)) return removeMember(userId)
        val successor = members.filter { it.userId != userId }.minByOrNull { it.joinedAt } ?: return null
        return transferOwnership(successor.userId).removeMember(userId)
    }

    companion object {
        const val MAX_NAME_LENGTH = 60

        fun create(id: SpaceId, name: String, owner: UserId, now: Instant) =
            Space(id, name.trim(), listOf(Member(owner, Role.OWNER, now)), emptyList(), now)

        fun validateName(name: String) {
            if (name.isBlank() || name != name.trim() || name.length > MAX_NAME_LENGTH) {
                throw DomainException(ErrorKind.VALIDATION, "INVALID_NAME", "Name must be 1-$MAX_NAME_LENGTH characters")
            }
        }

        fun invalidInvite() = DomainException(ErrorKind.NOT_FOUND, "INVITE_INVALID", "Invite link is invalid, used or expired")

        private fun notAMember() = DomainException(ErrorKind.NOT_FOUND, "MEMBER_NOT_FOUND", "User is not a member")
    }
}
