package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.PendingToken
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.junit.jupiter.api.io.TempDir
import java.nio.file.Files
import java.nio.file.Path
import java.time.Instant
import kotlin.io.path.exists
import kotlin.io.path.listDirectoryEntries
import kotlin.io.path.readText
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class FileUserRepositoryTest {

    @TempDir
    lateinit var dataDir: Path

    private val repository by lazy { FileUserRepository(JsonFiles(dataDir)) }

    private val user = User(
        id = UserId("u-1"),
        email = Email.of("anna@example.com"),
        displayName = "Anna",
        passwordHash = "hash",
        emailVerified = false,
        createdAt = Instant.parse("2026-01-01T10:00:00Z"),
        settings = UserSettings(Language.DE, ThemePreference.DARK, false, true),
        sessionVersion = 3,
        emailVerification = PendingToken("vhash", Instant.parse("2026-01-02T10:00:00Z")),
        passwordReset = PendingToken("rhash", Instant.parse("2026-01-01T10:30:00Z")),
    )

    @Test
    fun `round-trips a user with all fields`() {
        repository.save(user)
        assertEquals(user, repository.findById(user.id))
    }

    @Test
    fun `writes users-id-user json with a schema version and leaves no temp files`() {
        repository.save(user)
        val file = dataDir.resolve("users/u-1/user.json")
        assertTrue(file.exists())
        assertTrue(file.readText().contains("\"schemaVersion\" : 1"))
        assertEquals(listOf("user.json"), file.parent.listDirectoryEntries().map { it.fileName.toString() })
    }

    @Test
    fun `finds by email and token hashes`() {
        repository.save(user)
        repository.save(user.copy(id = UserId("u-2"), email = Email.of("bob@example.com"), emailVerification = null, passwordReset = null))

        assertEquals(UserId("u-2"), repository.findByEmail(Email.of("BOB@example.com"))?.id)
        assertEquals(user.id, repository.findByVerificationTokenHash("vhash")?.id)
        assertEquals(user.id, repository.findByPasswordResetTokenHash("rhash")?.id)
        assertNull(repository.findByEmail(Email.of("nobody@example.com")))
    }

    @Test
    fun `delete removes the whole user directory`() {
        repository.save(user)
        Files.writeString(dataDir.resolve("users/u-1/favorites.json"), "{}")
        repository.delete(user.id)
        assertFalse(dataDir.resolve("users/u-1").exists())
        assertNull(repository.findById(user.id))
    }

    @Test
    fun `ignores unknown fields from newer files`() {
        repository.save(user)
        val file = dataDir.resolve("users/u-1/user.json")
        Files.writeString(file, file.readText().replaceFirst("{", "{ \"futureField\": 42,"))
        assertEquals(user, repository.findById(user.id))
    }

    @Test
    fun `rejects ids that could escape the data directory`() {
        assertNull(repository.findById(UserId("../etc")))
        assertThrows<IllegalArgumentException> { repository.save(user.copy(id = UserId("../evil"))) }
        assertThrows<IllegalArgumentException> { JsonFiles.safeSegment("a/b") }
        assertThrows<IllegalArgumentException> { JsonFiles.safeSegment("") }
    }

    @Test
    fun `a corrupt user file is skipped by lookups over all users, but not by a direct read`() {
        repository.save(user)
        val broken = dataDir.resolve("users/u-broken/user.json")
        Files.createDirectories(broken.parent)
        Files.writeString(broken, "{ not json")

        // other users can still log in
        assertEquals(user.id, repository.findByEmail(user.email)?.id)
        // the broken file itself is not silently treated as missing (it could be overwritten)
        assertThrows<java.io.UncheckedIOException> { repository.findById(UserId("u-broken")) }
    }
}
