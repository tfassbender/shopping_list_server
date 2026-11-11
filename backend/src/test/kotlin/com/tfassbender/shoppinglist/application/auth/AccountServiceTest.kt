package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.FakeTokenIssuer
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.application.RecordingEmailSender
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import kotlin.test.assertEquals
import kotlin.test.assertTrue

class AccountServiceTest {

    private val users = InMemoryUserRepository()
    private val clock = MutableClock()
    private val tokens = FakeTokenIssuer(clock)
    private val auth = AuthService(users, RecordingEmailSender(), tokens, clock, true, 60, 30)
    private val accounts = AccountService(users, tokens)
    private val user = auth.register(RegisterCommand("anna@example.com", "Anna", "secret-password")).user

    @Test
    fun `settings are replaced and persisted`() {
        val settings = UserSettings(Language.DE, ThemePreference.DARK, checkedItemsToEnd = false, ignoreMergeWarnings = true)
        accounts.updateSettings(user.id, settings)
        assertEquals(settings, users.findById(user.id)?.settings)
    }

    @Test
    fun `display name is trimmed and validated`() {
        assertEquals("Anna B", accounts.rename(user.id, "  Anna B ").displayName)
        assertEquals("INVALID_DISPLAY_NAME", assertThrows<DomainException> { accounts.rename(user.id, "x".repeat(41)) }.code)
    }

    @Test
    fun `change password requires the current password and invalidates old sessions`() {
        assertEquals("WRONG_PASSWORD", assertThrows<DomainException> { accounts.changePassword(user.id, "wrong-one", "new-password") }.code)

        val result = accounts.changePassword(user.id, "secret-password", "new-password")

        assertEquals(1, result.user.sessionVersion)
        assertEquals("token-${user.id.value}-1", result.session?.value)
        assertThrows<DomainException> { auth.requireActiveSession(user.id, 0) }
        assertTrue(auth.login("anna@example.com", "new-password").session != null)
    }

    @Test
    fun `logout everywhere bumps the session version`() {
        val result = accounts.logoutEverywhere(user.id)
        assertEquals(1, result.user.sessionVersion)
        assertEquals(result.user, auth.requireActiveSession(user.id, 1))
    }

    @Test
    fun `unknown user is reported as not found`() {
        assertEquals("USER_NOT_FOUND", assertThrows<DomainException> { accounts.me(UserId("missing")) }.code)
    }
}
