package com.tfassbender.shoppinglist.adapter.persistence.jpa

import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.PendingToken
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import jakarta.persistence.Entity
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

/*
 * JPA entities of the personal aggregates. Like all entities they are mutable persistence classes that
 * never leave the adapter: repositories map them to the immutable domain objects and back.
 */

/** Table `users`: the `User` aggregate, flattened (settings and pending tokens become columns). */
@Entity
@Table(name = "users")
class UserEntity(
    @Id var id: String,
    var email: String,
    var displayName: String,
    var passwordHash: String,
    var emailVerified: Boolean,
    var createdAt: Instant,
    var language: String,
    var theme: String,
    var checkedItemsToEnd: Boolean,
    var ignoreMergeWarnings: Boolean,
    var sessionVersion: Int,
    var emailVerificationHash: String?,
    var emailVerificationExpiresAt: Instant?,
    var passwordResetHash: String?,
    var passwordResetExpiresAt: Instant?,
) {
    fun toDomain() = User(
        id = UserId(id),
        email = Email.trusted(email),
        displayName = displayName,
        passwordHash = passwordHash,
        emailVerified = emailVerified,
        createdAt = createdAt,
        settings = UserSettings(Language.fromCode(language), ThemePreference.valueOf(theme), checkedItemsToEnd, ignoreMergeWarnings),
        sessionVersion = sessionVersion,
        emailVerification = pendingToken(emailVerificationHash, emailVerificationExpiresAt),
        passwordReset = pendingToken(passwordResetHash, passwordResetExpiresAt),
    )

    private fun pendingToken(hash: String?, expiresAt: Instant?): PendingToken? =
        if (hash != null && expiresAt != null) PendingToken(hash, expiresAt) else null

    companion object {
        fun fromDomain(user: User) = UserEntity(
            id = user.id.value,
            email = user.email.value,
            displayName = user.displayName,
            passwordHash = user.passwordHash,
            emailVerified = user.emailVerified,
            createdAt = user.createdAt,
            language = user.settings.language.code,
            theme = user.settings.theme.name,
            checkedItemsToEnd = user.settings.checkedItemsToEnd,
            ignoreMergeWarnings = user.settings.ignoreMergeWarnings,
            sessionVersion = user.sessionVersion,
            emailVerificationHash = user.emailVerification?.hash,
            emailVerificationExpiresAt = user.emailVerification?.expiresAt,
            passwordResetHash = user.passwordReset?.hash,
            passwordResetExpiresAt = user.passwordReset?.expiresAt,
        )
    }
}

/**
 * Table `api_tokens`: one row per token of the `UserApiTokens` aggregate. The aggregate root has no row of
 * its own - it is "all tokens of a user", ordered by [position].
 */
@Entity
@Table(name = "api_tokens")
class ApiTokenEntity(
    @Id var id: String,
    var userId: String,
    var position: Int,
    var name: String,
    var scope: String,
    var hash: String,
    var createdAt: Instant,
    var expiresAt: Instant?,
    var lastUsedAt: Instant?,
) {
    fun toDomain() = ApiToken(ApiTokenId(id), name, TokenScope.valueOf(scope), hash, createdAt, expiresAt, lastUsedAt)

    fun updateFrom(token: ApiToken, position: Int) {
        this.position = position
        name = token.name
        scope = token.scope.name
        hash = token.hash
        createdAt = token.createdAt
        expiresAt = token.expiresAt
        lastUsedAt = token.lastUsedAt
    }

    companion object {
        fun fromDomain(userId: UserId, token: ApiToken, position: Int) = ApiTokenEntity(
            token.id.value, userId.value, position, token.name, token.scope.name, token.hash,
            token.createdAt, token.expiresAt, token.lastUsedAt,
        )
    }
}
