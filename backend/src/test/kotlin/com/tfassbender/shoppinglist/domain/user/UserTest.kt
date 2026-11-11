package com.tfassbender.shoppinglist.domain.user

import com.tfassbender.shoppinglist.domain.DomainException
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class UserTest {

    @Test
    fun `email is normalized and validated`() {
        assertEquals("anna@example.com", Email.of("  Anna@Example.COM ").value)
        listOf("", "anna", "anna@", "@example.com", "an na@example.com", "a@b", "a@@b.de").forEach {
            assertEquals("INVALID_EMAIL", assertThrows<DomainException> { Email.of(it) }.code, it)
        }
    }

    @Test
    fun `language codes`() {
        assertEquals(Language.DE, Language.fromCode("de"))
        assertEquals("INVALID_LANGUAGE", assertThrows<DomainException> { Language.fromCode("fr") }.code)
    }

    @Test
    fun `pending token is valid until its expiry inclusive`() {
        val token = PendingToken("h", Instant.parse("2026-01-01T10:00:00Z"))
        assertTrue(token.isValidAt(Instant.parse("2026-01-01T10:00:00Z")))
        assertFalse(token.isValidAt(Instant.parse("2026-01-01T10:00:01Z")))
    }

    @Test
    fun `new password clears reset token and bumps session version`() {
        val user = User(
            UserId("u"), Email.of("a@b.de"), "Anna", "old", true, Instant.EPOCH,
            passwordReset = PendingToken("h", Instant.EPOCH),
        )
        val updated = user.withNewPassword("new")
        assertEquals("new", updated.passwordHash)
        assertNull(updated.passwordReset)
        assertEquals(1, updated.sessionVersion)
    }

    @Test
    fun `display name rules`() {
        assertThrows<DomainException> { User(UserId("u"), Email.of("a@b.de"), " Anna", "h", true, Instant.EPOCH) }
        assertThrows<DomainException> { User(UserId("u"), Email.of("a@b.de"), "", "h", true, Instant.EPOCH) }
        User(UserId("u"), Email.of("a@b.de"), "Anna-Lena Müller", "h", true, Instant.EPOCH)
    }
}
