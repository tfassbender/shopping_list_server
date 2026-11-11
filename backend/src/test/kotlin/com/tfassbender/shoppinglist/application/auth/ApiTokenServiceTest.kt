package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.InMemoryApiTokenRepository
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

class ApiTokenServiceTest {

    private val clock = MutableClock()
    private val users = InMemoryUserRepository()
    private val repository = InMemoryApiTokenRepository()
    private val service = ApiTokenService(repository, users, clock)
    private val anna = UserId("anna-1")

    init {
        users.save(User(anna, Email.of("anna@example.com"), "Anna", "h", true, clock.instant()))
    }

    @Test
    fun `created token authenticates as its user with its scope`() {
        val created = service.create(anna, " Claude ", TokenScope.FULL, Duration.ofDays(30))

        assertTrue(created.rawToken.startsWith("slt_anna-1_"))
        assertEquals("Claude", created.token.name)
        assertFalse(repository.find(anna).tokens.single().hash.contains(created.rawToken)) // only the hash is stored
        assertEquals(ApiTokenCaller(anna, TokenScope.FULL), service.authenticate(created.rawToken))
    }

    @Test
    fun `wrong, malformed, foreign and revoked tokens are rejected`() {
        val created = service.create(anna, "Agent", TokenScope.READ, null)
        assertNull(service.authenticate(created.rawToken + "x"))
        assertNull(service.authenticate("slt_"))
        assertNull(service.authenticate("slt_../evil_abc"))
        assertNull(service.authenticate("not-a-token"))
        assertNull(service.authenticate(created.rawToken.replace("anna-1", "bob-1")))

        service.revoke(anna, created.token.id)
        assertNull(service.authenticate(created.rawToken))
        assertEquals("TOKEN_NOT_FOUND", assertThrows<DomainException> { service.revoke(anna, created.token.id) }.code)
    }

    @Test
    fun `tokens expire, null means never`() {
        val shortLived = service.create(anna, "Short", TokenScope.READ, Duration.ofDays(1))
        val forever = service.create(anna, "Forever", TokenScope.READ, null)

        clock.advance(Duration.ofDays(1))
        assertNull(service.authenticate(shortLived.rawToken))
        clock.advance(Duration.ofDays(10_000))
        assertNotNull(service.authenticate(forever.rawToken))
    }

    @Test
    fun `tokens of deleted users are invalid`() {
        val created = service.create(anna, "Agent", TokenScope.FULL, null)
        users.delete(anna)
        assertNull(service.authenticate(created.rawToken))
    }

    @Test
    fun `last use is recorded at most once per hour`() {
        val created = service.create(anna, "Agent", TokenScope.FULL, null)
        val savesBefore = repository.saves

        service.authenticate(created.rawToken)
        service.authenticate(created.rawToken)
        assertEquals(savesBefore + 1, repository.saves)
        assertEquals(clock.instant(), service.list(anna).single().lastUsedAt)

        clock.advance(Duration.ofMinutes(61))
        service.authenticate(created.rawToken)
        assertEquals(savesBefore + 2, repository.saves)
    }

    @Test
    fun `validation of name, expiry and token count`() {
        assertEquals("INVALID_NAME", assertThrows<DomainException> { service.create(anna, " ", TokenScope.READ, null) }.code)
        assertEquals("INVALID_EXPIRY", assertThrows<DomainException> { service.create(anna, "x", TokenScope.READ, Duration.ofHours(2)) }.code)
        repeat(20) { service.create(anna, "t$it", TokenScope.READ, null) }
        assertEquals("TOO_MANY_TOKENS", assertThrows<DomainException> { service.create(anna, "one more", TokenScope.READ, null) }.code)
    }
}
