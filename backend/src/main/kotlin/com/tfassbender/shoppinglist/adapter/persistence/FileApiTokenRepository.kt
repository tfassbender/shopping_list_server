package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.UserApiTokens
import com.tfassbender.shoppinglist.domain.user.UserId
import java.nio.file.Path
import java.time.Instant

/** Stores `users/<userId>/api-tokens.json` (deleted together with the account). */
class FileApiTokenRepository(private val files: JsonFiles) : ApiTokenRepository {

    data class TokenFile(
        val id: String,
        val name: String,
        val scope: String,
        val hash: String,
        val createdAt: Instant,
        val expiresAt: Instant? = null,
        val lastUsedAt: Instant? = null,
    )

    data class TokensFile(val schemaVersion: Int = 1, val tokens: List<TokenFile> = emptyList())

    override fun find(userId: UserId): UserApiTokens {
        val file = files.read(file(userId), TokensFile::class.java) ?: return UserApiTokens(userId)
        return UserApiTokens(
            userId,
            file.tokens.map { ApiToken(ApiTokenId(it.id), it.name, TokenScope.valueOf(it.scope), it.hash, it.createdAt, it.expiresAt, it.lastUsedAt) },
        )
    }

    override fun save(tokens: UserApiTokens) {
        val content = TokensFile(
            tokens = tokens.tokens.map { TokenFile(it.id.value, it.name, it.scope.name, it.hash, it.createdAt, it.expiresAt, it.lastUsedAt) },
        )
        files.write(file(tokens.userId), content)
    }

    private fun file(userId: UserId): Path = files.userDir(userId.value).resolve("api-tokens.json")
}
