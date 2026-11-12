package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.port.TransactionRunner
import com.tfassbender.shoppinglist.application.FakeTokenIssuer
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.RecordingEmailSender
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.user.Language
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class AuthServiceTest {

    private val users = InMemoryUserRepository()
    private val mails = RecordingEmailSender()
    private val clock = MutableClock()

    private fun service(emailDisabled: Boolean) =
        AuthService(users, mails, FakeTokenIssuer(clock), UserLocks(TransactionRunner.NONE), clock, emailDisabled, verificationTtlMinutes = 60, resetTtlMinutes = 30)

    private val command = RegisterCommand("  Anna@Example.com ", "Anna", "secret-password", Language.DE)

    @Nested
    inner class EmailDisabled {
        private val auth = service(emailDisabled = true)

        @Test
        fun `register creates a verified user and returns a session`() {
            val result = auth.register(command)

            assertNotNull(result.session)
            assertTrue(result.user.emailVerified)
            assertEquals("anna@example.com", result.user.email.value)
            assertEquals(Language.DE, result.user.settings.language)
            assertTrue(mails.sent.isEmpty())
        }

        @Test
        fun `password is stored hashed`() {
            val user = auth.register(command).user
            assertFalse(user.passwordHash.contains("secret-password"))
            assertTrue(Passwords.matches("secret-password", user.passwordHash))
        }

        @Test
        fun `duplicate email is rejected case-insensitively`() {
            auth.register(command)
            val error = assertThrows<DomainException> { auth.register(command.copy(email = "ANNA@example.com")) }
            assertEquals("EMAIL_TAKEN", error.code)
        }

        @Test
        fun `invalid input is rejected`() {
            assertEquals("INVALID_EMAIL", assertThrows<DomainException> { auth.register(command.copy(email = "nope")) }.code)
            assertEquals("PASSWORD_TOO_SHORT", assertThrows<DomainException> { auth.register(command.copy(password = "short")) }.code)
            assertEquals("PASSWORD_TOO_LONG", assertThrows<DomainException> { auth.register(command.copy(password = "ä".repeat(37))) }.code)
            assertEquals("INVALID_DISPLAY_NAME", assertThrows<DomainException> { auth.register(command.copy(displayName = "  ")) }.code)
            assertTrue(users.users.isEmpty())
        }

        @Test
        fun `login succeeds with the right password and normalizes the email`() {
            auth.register(command)
            val result = auth.login("ANNA@example.com ", "secret-password")
            assertNotNull(result.session)
        }

        @Test
        fun `login fails with the same error for wrong password and unknown user`() {
            auth.register(command)
            assertEquals("INVALID_CREDENTIALS", assertThrows<DomainException> { auth.login("anna@example.com", "wrong-password") }.code)
            assertEquals("INVALID_CREDENTIALS", assertThrows<DomainException> { auth.login("bob@example.com", "secret-password") }.code)
            assertEquals("INVALID_CREDENTIALS", assertThrows<DomainException> { auth.login("garbage", "x") }.code)
        }

        @Test
        fun `a password longer than BCrypt can hash is just a wrong password at login`() {
            // BCrypt throws beyond 72 bytes; that must not surface as a 500.
            auth.register(command)
            val tooLong = "secret-password" + "x".repeat(Passwords.MAX_BYTES)
            assertEquals("INVALID_CREDENTIALS", assertThrows<DomainException> { auth.login("anna@example.com", tooLong) }.code)
        }

        @Test
        fun `email flows are unavailable`() {
            assertEquals("EMAIL_DISABLED", assertThrows<DomainException> { auth.requestPasswordReset("a@b.cd") }.code)
            assertEquals("EMAIL_DISABLED", assertThrows<DomainException> { auth.verifyEmail("x") }.code)
        }

        @Test
        fun `active session check rejects outdated session versions and deleted users`() {
            val user = auth.register(command).user
            assertEquals(user, auth.requireActiveSession(user.id, 0))
            assertEquals("SESSION_EXPIRED", assertThrows<DomainException> { auth.requireActiveSession(user.id, 1) }.code)
            users.delete(user.id)
            assertEquals("SESSION_EXPIRED", assertThrows<DomainException> { auth.requireActiveSession(user.id, 0) }.code)
        }
    }

    @Nested
    inner class EmailEnabled {
        private val auth = service(emailDisabled = false)

        @Test
        fun `register sends a verification mail in the user's language and returns no session`() {
            val result = auth.register(command)

            assertNull(result.session)
            assertFalse(result.user.emailVerified)
            assertEquals(Language.DE, mails.sent.single().language)
            // only the hash is stored
            assertEquals(SecretTokens.hash(mails.lastToken("verification")), users.users.values.single().emailVerification?.hash)
        }

        @Test
        fun `login is refused until the email is verified`() {
            auth.register(command)
            assertEquals("EMAIL_NOT_VERIFIED", assertThrows<DomainException> { auth.login("anna@example.com", "secret-password") }.code)

            val verified = auth.verifyEmail(mails.lastToken("verification"))

            assertTrue(verified.user.emailVerified)
            assertNull(verified.user.emailVerification)
            assertNotNull(auth.login("anna@example.com", "secret-password").session)
        }

        @Test
        fun `verification token is single use and expires`() {
            auth.register(command)
            val token = mails.lastToken("verification")
            auth.verifyEmail(token)
            assertEquals("INVALID_TOKEN", assertThrows<DomainException> { auth.verifyEmail(token) }.code)

            auth.register(command.copy(email = "bob@example.com"))
            clock.advance(Duration.ofMinutes(61))
            assertEquals("INVALID_TOKEN", assertThrows<DomainException> { auth.verifyEmail(mails.lastToken("verification")) }.code)
        }

        @Test
        fun `resend replaces the verification token and ignores unknown or verified accounts`() {
            auth.register(command)
            val first = mails.lastToken("verification")
            auth.resendVerification("anna@example.com")
            val second = mails.lastToken("verification")

            assertEquals("INVALID_TOKEN", assertThrows<DomainException> { auth.verifyEmail(first) }.code)
            auth.verifyEmail(second)

            val mailsBefore = mails.sent.size
            auth.resendVerification("anna@example.com")
            auth.resendVerification("unknown@example.com")
            auth.resendVerification("not an email")
            assertEquals(mailsBefore, mails.sent.size)
        }

        @Test
        fun `password reset sets the new password, verifies the email and invalidates old sessions`() {
            val user = auth.register(command).user
            auth.requestPasswordReset("anna@example.com")

            val result = auth.resetPassword(mails.lastToken("reset"), "new-password-1")

            assertTrue(result.user.emailVerified)
            assertEquals(user.sessionVersion + 1, result.user.sessionVersion)
            assertNotNull(auth.login("anna@example.com", "new-password-1").session)
            assertThrows<DomainException> { auth.login("anna@example.com", "secret-password") }
        }

        @Test
        fun `reset token is single use, expires and requires a valid password`() {
            auth.register(command)
            auth.requestPasswordReset("anna@example.com")
            val token = mails.lastToken("reset")

            assertEquals("PASSWORD_TOO_SHORT", assertThrows<DomainException> { auth.resetPassword(token, "x") }.code)
            auth.resetPassword(token, "new-password-1")
            assertEquals("INVALID_TOKEN", assertThrows<DomainException> { auth.resetPassword(token, "new-password-2") }.code)

            auth.requestPasswordReset("anna@example.com")
            clock.advance(Duration.ofMinutes(31))
            assertEquals("INVALID_TOKEN", assertThrows<DomainException> { auth.resetPassword(mails.lastToken("reset"), "new-password-3") }.code)
        }

        @Test
        fun `forgot password for an unknown email silently does nothing`() {
            auth.requestPasswordReset("unknown@example.com")
            assertTrue(mails.sent.isEmpty())
        }
    }
}
