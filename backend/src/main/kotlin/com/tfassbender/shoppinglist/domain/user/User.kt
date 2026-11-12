package com.tfassbender.shoppinglist.domain.user

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import java.time.Instant

@JvmInline
value class UserId(val value: String)

/** A normalized (trimmed, lowercase) and syntactically valid email address. */
@JvmInline
value class Email private constructor(val value: String) {
    companion object {
        // No whitespace, exactly one '@', a dotted domain. Real validation is the verification email.
        private val PATTERN = Regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$")

        fun of(raw: String): Email {
            val normalized = raw.trim().lowercase()
            if (!PATTERN.matches(normalized) || normalized.length > 254) {
                throw DomainException(ErrorKind.VALIDATION, "INVALID_EMAIL", "Not a valid email address: $raw")
            }
            return Email(normalized)
        }

        /** Restores an already validated value (persistence); skips validation on purpose. */
        fun trusted(value: String): Email = Email(value)
    }
}

enum class Language(val code: String) {
    EN("en"),
    DE("de"),
    ;

    companion object {
        fun fromCode(code: String): Language = entries.firstOrNull { it.code == code }
            ?: throw DomainException(ErrorKind.VALIDATION, "INVALID_LANGUAGE", "Unsupported language: $code")
    }
}

enum class ThemePreference { SYSTEM, LIGHT, DARK }

/** Personal settings; they apply to all clients of the user (web, Android). */
data class UserSettings(
    val language: Language = Language.EN,
    val theme: ThemePreference = ThemePreference.SYSTEM,
    val checkedItemsToEnd: Boolean = true,
    val ignoreMergeWarnings: Boolean = false,
)

/** A hashed single-use token (email verification, password reset) with its expiry. */
data class PendingToken(val hash: String, val expiresAt: Instant) {
    fun isValidAt(now: Instant): Boolean = !now.isAfter(expiresAt)
}

/**
 * A registered account. [sessionVersion] is embedded in every issued session token; incrementing it
 * (password change/reset, "log out everywhere") invalidates all tokens issued before.
 */
data class User(
    val id: UserId,
    val email: Email,
    val displayName: String,
    val passwordHash: String,
    val emailVerified: Boolean,
    val createdAt: Instant,
    val settings: UserSettings = UserSettings(),
    val sessionVersion: Int = 0,
    val emailVerification: PendingToken? = null,
    val passwordReset: PendingToken? = null,
    /**
     * Ids of the user's spaces in the order the user chose (personal: members of a shared space order
     * their spaces differently). Plain strings, because `domain.space` already depends on this package.
     */
    val spaceOrder: List<String> = emptyList(),
) {
    init {
        validateDisplayName(displayName)
    }

    fun rename(newDisplayName: String): User = copy(displayName = newDisplayName.trim())

    fun withNewPassword(newHash: String): User =
        copy(passwordHash = newHash, passwordReset = null, sessionVersion = sessionVersion + 1)

    fun invalidateSessions(): User = copy(sessionVersion = sessionVersion + 1)

    companion object {
        const val MAX_DISPLAY_NAME_LENGTH = 40

        fun validateDisplayName(displayName: String) {
            if (displayName.isBlank() || displayName != displayName.trim() || displayName.length > MAX_DISPLAY_NAME_LENGTH) {
                throw DomainException(
                    ErrorKind.VALIDATION,
                    "INVALID_DISPLAY_NAME",
                    "Display name must be 1-$MAX_DISPLAY_NAME_LENGTH characters without surrounding spaces",
                )
            }
        }
    }
}
