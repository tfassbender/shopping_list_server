package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.PendingToken
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import java.time.Instant

/** Stores `users/<id>/user.json`. Lookups other than by id scan all user directories (fine at this scale). */
class FileUserRepository(private val files: JsonFiles) : UserRepository {

    override fun findById(id: UserId): User? =
        runCatching { files.userDir(id.value) }.getOrNull()
            ?.let { files.read(it.resolve(FILE_NAME), UserFile::class.java) }
            ?.toDomain()

    override fun findByEmail(email: Email): User? = all().firstOrNull { it.email == email }

    override fun findByVerificationTokenHash(hash: String): User? =
        all().firstOrNull { it.emailVerification?.hash == hash }

    override fun findByPasswordResetTokenHash(hash: String): User? =
        all().firstOrNull { it.passwordReset?.hash == hash }

    override fun save(user: User) {
        files.write(files.userDir(user.id.value).resolve(FILE_NAME), UserFile.fromDomain(user))
    }

    override fun delete(id: UserId) {
        files.deleteRecursively(files.userDir(id.value))
    }

    private fun all(): Sequence<User> = files.subdirectories(files.usersDir()).asSequence()
        .mapNotNull { files.read(it.resolve(FILE_NAME), UserFile::class.java)?.toDomain() }

    private companion object {
        const val FILE_NAME = "user.json"
    }
}

data class PendingTokenFile(val hash: String, val expiresAt: Instant) {
    fun toDomain() = PendingToken(hash, expiresAt)

    companion object {
        fun fromDomain(token: PendingToken?) = token?.let { PendingTokenFile(it.hash, it.expiresAt) }
    }
}

data class UserFile(
    val schemaVersion: Int = 1,
    val id: String,
    val email: String,
    val displayName: String,
    val passwordHash: String,
    val emailVerified: Boolean,
    val createdAt: Instant,
    val language: String = "en",
    val theme: String = "SYSTEM",
    val checkedItemsToEnd: Boolean = true,
    val ignoreMergeWarnings: Boolean = false,
    val sessionVersion: Int = 0,
    val emailVerification: PendingTokenFile? = null,
    val passwordReset: PendingTokenFile? = null,
) {
    fun toDomain() = User(
        id = UserId(id),
        email = Email.trusted(email),
        displayName = displayName,
        passwordHash = passwordHash,
        emailVerified = emailVerified,
        createdAt = createdAt,
        settings = UserSettings(
            language = Language.fromCode(language),
            theme = ThemePreference.valueOf(theme),
            checkedItemsToEnd = checkedItemsToEnd,
            ignoreMergeWarnings = ignoreMergeWarnings,
        ),
        sessionVersion = sessionVersion,
        emailVerification = emailVerification?.toDomain(),
        passwordReset = passwordReset?.toDomain(),
    )

    companion object {
        fun fromDomain(user: User) = UserFile(
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
            emailVerification = PendingTokenFile.fromDomain(user.emailVerification),
            passwordReset = PendingTokenFile.fromDomain(user.passwordReset),
        )
    }
}
