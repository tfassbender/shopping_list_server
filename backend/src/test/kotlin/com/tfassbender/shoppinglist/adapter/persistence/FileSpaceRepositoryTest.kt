package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.exists
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull

class FileSpaceRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    private val repository by lazy { FileSpaceRepository(JsonFiles(dataDir)) }
    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val space = Space.create(SpaceId("s1"), "Home", UserId("owner"), t0)
        .addInvite(Invite(InviteId("i1"), "hash", UserId("owner"), t0, t0.plusSeconds(60)))
        .acceptInvite("hash", UserId("anna"), t0)
        .addInvite(Invite(InviteId("i2"), "hash2", UserId("owner"), t0, t0.plusSeconds(60)))

    @Test
    fun `round-trips a space with members and invites`() {
        repository.save(space)
        assertEquals(space, repository.findById(space.id))
        assertEquals(true, dataDir.resolve("spaces/s1/space.json").exists())
    }

    @Test
    fun `finds by member and invite hash`() {
        repository.save(space)
        repository.save(Space.create(SpaceId("s2"), "Other", UserId("bob"), t0))

        assertEquals(listOf(space.id), repository.findByMember(UserId("anna")).map { it.id })
        assertEquals(space.id, repository.findByInviteTokenHash("hash2")?.id)
        assertNull(repository.findByInviteTokenHash("hash"))
    }

    @Test
    fun `delete removes the space directory including lists`() {
        repository.save(space)
        Files.createDirectories(dataDir.resolve("spaces/s1/lists"))
        Files.writeString(dataDir.resolve("spaces/s1/lists/l1.json"), "{}")

        repository.delete(space.id)

        assertFalse(dataDir.resolve("spaces/s1").exists())
    }
}
