package com.tfassbender.shoppinglist.domain.user

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import java.time.Instant

@JvmInline
value class ApiTokenId(val value: String)

/** READ: only reading requests; FULL: everything the user may do (except account/token management). */
enum class TokenScope { READ, FULL }

/** A personal API token for AI agents and scripts. Only the hash of the raw token is stored. */
data class ApiToken(
    val id: ApiTokenId,
    val name: String,
    val scope: TokenScope,
    val hash: String,
    val createdAt: Instant,
    /** null = never expires. */
    val expiresAt: Instant?,
    val lastUsedAt: Instant? = null,
) {
    init {
        if (name.isBlank() || name != name.trim() || name.length > MAX_NAME_LENGTH) {
            throw DomainException(ErrorKind.VALIDATION, "INVALID_NAME", "Token name must be 1-$MAX_NAME_LENGTH characters")
        }
    }

    fun isValidAt(now: Instant): Boolean = expiresAt == null || now.isBefore(expiresAt)

    companion object {
        const val MAX_NAME_LENGTH = 60
    }
}

/** All API tokens of one user (one file per user). */
data class UserApiTokens(val userId: UserId, val tokens: List<ApiToken> = emptyList()) {

    fun add(token: ApiToken): UserApiTokens {
        if (tokens.size >= MAX_TOKENS) {
            throw DomainException(ErrorKind.VALIDATION, "TOO_MANY_TOKENS", "At most $MAX_TOKENS API tokens")
        }
        return copy(tokens = tokens + token)
    }

    fun revoke(id: ApiTokenId): UserApiTokens {
        if (tokens.none { it.id == id }) {
            throw DomainException(ErrorKind.NOT_FOUND, "TOKEN_NOT_FOUND", "No API token ${id.value}")
        }
        return copy(tokens = tokens.filterNot { it.id == id })
    }

    fun findByHash(hash: String): ApiToken? = tokens.firstOrNull { it.hash == hash }

    fun markUsed(id: ApiTokenId, now: Instant): UserApiTokens =
        copy(tokens = tokens.map { if (it.id == id) it.copy(lastUsedAt = now) else it })

    companion object {
        const val MAX_TOKENS = 20
    }
}
