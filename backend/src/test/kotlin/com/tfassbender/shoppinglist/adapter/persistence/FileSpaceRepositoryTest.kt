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
import kotlin.test.assertTrue

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
    fun `unknown and crafted ids find nothing`() {
        repository.save(space)
        assertNull(repository.findById(SpaceId("missing")))
        assertNull(repository.findById(SpaceId("../users")))
    }

    @Test
    fun `space directories without a space file are skipped`() {
        // E.g. a sequence file written for a space whose space.json is gone.
        repository.save(space)
        Files.createDirectories(dataDir.resolve("spaces/orphan"))
        Files.writeString(dataDir.resolve("spaces/orphan/sequence.json"), "{}")

        assertEquals(listOf(space.id), repository.findByMember(UserId("owner")).map { it.id })
    }

    @Test
    fun `older files without invites load`() {
        Files.createDirectories(dataDir.resolve("spaces/old"))
        Files.writeString(
            dataDir.resolve("spaces/old/space.json"),
            """{"id":"old","name":"Old","createdAt":"2026-01-01T10:00:00Z","members":[{"userId":"owner","role":"OWNER","joinedAt":"2026-01-01T10:00:00Z"}]}""",
        )

        val loaded = repository.findById(SpaceId("old"))!!
        assertEquals(UserId("owner"), loaded.owner.userId)
        assertTrue(loaded.invites.isEmpty())
    }

    @Test
    fun `delete removes the space directory including lists`() {
        repository.save(space)
        Files.createDirectories(dataDir.resolve("spaces/s1/lists"))
        Files.writeString(dataDir.resolve("spaces/s1/lists/l1.json"), "{}")

        repository.delete(space.id)

        assertFalse(dataDir.resolve("spaces/s1").exists())
    }

    @Test
    fun `a corrupt or invalid space file is skipped when searching all spaces`() {
        repository.save(space)
        Files.createDirectories(dataDir.resolve("spaces/broken"))
        Files.writeString(dataDir.resolve("spaces/broken/space.json"), "{ not json")
        // valid JSON, but breaks a domain rule (no owner)
        Files.createDirectories(dataDir.resolve("spaces/invalid"))
        Files.writeString(dataDir.resolve("spaces/invalid/space.json"), """{"id":"invalid","name":"X","createdAt":"2026-01-01T10:00:00Z","members":[]}""")

        assertEquals(listOf(space.id), repository.findByMember(UserId("owner")).map { it.id })
    }
}
