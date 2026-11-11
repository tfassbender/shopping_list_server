package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.time.Duration
import java.util.UUID

data class CreatedApiToken(val token: ApiToken, val rawToken: String)

/** A successfully authenticated API token: who it acts as and what it may do. */
data class ApiTokenCaller(val userId: UserId, val scope: TokenScope)

/**
 * Personal API tokens. Raw format: `slt_<userId>_<secret>` – the user id lets the server find the right
 * token file without scanning all users; only the SHA-256 hash of the whole token is stored.
 */
@ApplicationScoped
class ApiTokenService(
    private val tokens: ApiTokenRepository,
    private val users: UserRepository,
    private val clock: Clock,
) {

    fun list(userId: UserId): List<ApiToken> = tokens.find(userId).tokens.sortedBy { it.createdAt }

    fun create(userId: UserId, name: String, scope: TokenScope, validFor: Duration?): CreatedApiToken {
        if (validFor != null && (validFor < Duration.ofDays(1) || validFor > Duration.ofDays(MAX_VALIDITY_DAYS))) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_EXPIRY", "Validity must be 1 to $MAX_VALIDITY_DAYS days")
        }
        val rawToken = "$PREFIX${userId.value}_${SecretTokens.newRawToken()}"
        val now = clock.instant()
        val token = ApiToken(
            id = ApiTokenId(UUID.randomUUID().toString()),
            name = name.trim(),
            scope = scope,
            hash = SecretTokens.hash(rawToken),
            createdAt = now,
            expiresAt = validFor?.let { now.plus(it) },
        )
        tokens.save(tokens.find(userId).add(token))
        return CreatedApiToken(token, rawToken)
    }

    fun revoke(userId: UserId, tokenId: ApiTokenId) {
        tokens.save(tokens.find(userId).revoke(tokenId))
    }

    /** Validates a raw token; null if it is unknown, revoked, expired or its user is gone. */
    fun authenticate(rawToken: String): ApiTokenCaller? {
        val userId = parseUserId(rawToken) ?: return null
        if (users.findById(userId) == null) return null
        val userTokens = tokens.find(userId)
        val token = userTokens.findByHash(SecretTokens.hash(rawToken)) ?: return null
        val now = clock.instant()
        if (!token.isValidAt(now)) return null
        // Remember the last use, but write at most once per hour (not on every request).
        if (token.lastUsedAt == null || token.lastUsedAt.isBefore(now.minus(LAST_USED_RESOLUTION))) {
            tokens.save(userTokens.markUsed(token.id, now))
        }
        return ApiTokenCaller(userId, token.scope)
    }

    private fun parseUserId(rawToken: String): UserId? {
        if (!rawToken.startsWith(PREFIX)) return null
        val userId = rawToken.removePrefix(PREFIX).substringBefore('_', missingDelimiterValue = "")
        return userId.takeIf { USER_ID.matches(it) }?.let(::UserId)
    }

    companion object {
        const val PREFIX = "slt_"
        const val MAX_VALIDITY_DAYS = 3650L
        private val LAST_USED_RESOLUTION: Duration = Duration.ofHours(1)
        private val USER_ID = Regex("^[A-Za-z0-9-]{1,64}$")

        fun looksLikeApiToken(value: String): Boolean = value.startsWith(PREFIX)
    }
}
