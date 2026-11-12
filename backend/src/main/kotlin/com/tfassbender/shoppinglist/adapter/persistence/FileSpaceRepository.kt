package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Member
import com.tfassbender.shoppinglist.domain.space.Role
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import java.time.Instant

/** Stores `spaces/<id>/space.json` (members, invites). The space directory also holds lists etc. */
class FileSpaceRepository(private val files: JsonFiles) : SpaceRepository {

    override fun findById(id: SpaceId): Space? =
        runCatching { files.spaceDir(id.value) }.getOrNull()
            ?.let { files.read(it.resolve(FILE_NAME), SpaceFile::class.java) }
            ?.toDomain()

    override fun findByMember(userId: UserId): List<Space> = all().filter { it.isMember(userId) }.toList()

    override fun findByInviteTokenHash(hash: String): Space? = all().firstOrNull { space -> space.invites.any { it.tokenHash == hash } }

    override fun save(space: Space) {
        files.write(files.spaceDir(space.id.value).resolve(FILE_NAME), SpaceFile.fromDomain(space))
    }

    override fun delete(id: SpaceId) {
        files.deleteRecursively(files.spaceDir(id.value))
    }

    private fun all(): Sequence<Space> = files.subdirectories(files.spacesDir()).asSequence()
        .mapNotNull { files.readForScan(it.resolve(FILE_NAME), SpaceFile::class.java) { file -> file.toDomain() } }

    private companion object {
        const val FILE_NAME = "space.json"
    }
}

data class MemberFile(val userId: String, val role: String, val joinedAt: Instant)

data class InviteFile(val id: String, val tokenHash: String, val createdBy: String, val createdAt: Instant, val expiresAt: Instant)

data class SpaceFile(
    val schemaVersion: Int = 1,
    val id: String,
    val name: String,
    val createdAt: Instant,
    val members: List<MemberFile> = emptyList(),
    val invites: List<InviteFile> = emptyList(),
) {
    fun toDomain() = Space(
        id = SpaceId(id),
        name = name,
        members = members.map { Member(UserId(it.userId), Role.valueOf(it.role), it.joinedAt) },
        invites = invites.map { Invite(InviteId(it.id), it.tokenHash, UserId(it.createdBy), it.createdAt, it.expiresAt) },
        createdAt = createdAt,
    )

    companion object {
        fun fromDomain(space: Space) = SpaceFile(
            id = space.id.value,
            name = space.name,
            createdAt = space.createdAt,
            members = space.members.map { MemberFile(it.userId.value, it.role.name, it.joinedAt) },
            invites = space.invites.map { InviteFile(it.id.value, it.tokenHash, it.createdBy.value, it.createdAt, it.expiresAt) },
        )
    }
}
