package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.port.EmailSender
import com.tfassbender.shoppinglist.application.port.SessionToken
import com.tfassbender.shoppinglist.application.port.TokenIssuer
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.PendingToken
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.time.Clock
import java.time.Duration
import java.util.UUID

data class RegisterCommand(
    val email: String,
    val displayName: String,
    val password: String,
    val language: Language = Language.EN,
)

/** Result of a successful auth operation. [session] is null when the email still has to be verified. */
data class AuthResult(val user: User, val session: SessionToken?)

/**
 * Registration, login and the token-based email flows. With [emailDisabled] (dev/test/e2e) accounts are
 * verified immediately and the email flows are unavailable, so no mail server is needed.
 * Unknown emails never cause an error in `resendVerification`/`requestPasswordReset` (no enumeration).
 */
@ApplicationScoped
class AuthService(
    private val users: UserRepository,
    private val emailSender: EmailSender,
    private val tokenIssuer: TokenIssuer,
    private val locks: UserLocks,
    private val clock: Clock,
    @param:ConfigProperty(name = "shoppinglist.auth.email-disabled", defaultValue = "false")
    val emailDisabled: Boolean,
    @param:ConfigProperty(name = "shoppinglist.auth.email-verification.token-ttl-minutes", defaultValue = "1440")
    private val verificationTtlMinutes: Long,
    @param:ConfigProperty(name = "shoppinglist.auth.password-reset.token-ttl-minutes", defaultValue = "30")
    private val resetTtlMinutes: Long,
) {
    // Serializes registrations so two concurrent requests can't both claim the same email.
    private val registrationLock = Any()

    fun register(command: RegisterCommand): AuthResult {
        val email = Email.of(command.email)
        Passwords.validate(command.password)
        val user = synchronized(registrationLock) {
            if (users.findByEmail(email) != null) {
                throw DomainException(ErrorKind.CONFLICT, "EMAIL_TAKEN", "Email already registered")
            }
            val newUser = User(
                id = UserId(UUID.randomUUID().toString()),
                email = email,
                displayName = command.displayName.trim(),
                passwordHash = Passwords.hash(command.password),
                emailVerified = emailDisabled,
                createdAt = clock.instant(),
                settings = UserSettings(language = command.language),
            )
            users.save(newUser)
            newUser
        }
        if (emailDisabled) {
            return AuthResult(user, tokenIssuer.issue(user))
        }
        return AuthResult(sendVerificationMail(user), session = null)
    }

    fun login(email: String, password: String): AuthResult {
        val user = runCatching { users.findByEmail(Email.of(email)) }.getOrNull()
        // Same error for unknown user and wrong password - don't reveal which.
        if (user == null || !Passwords.matches(password, user.passwordHash)) {
            throw DomainException(ErrorKind.UNAUTHORIZED, "INVALID_CREDENTIALS", "Invalid email or password")
        }
        if (!user.emailVerified && !emailDisabled) {
            throw DomainException(ErrorKind.UNAUTHORIZED, "EMAIL_NOT_VERIFIED", "Email not verified yet")
        }
        return AuthResult(user, tokenIssuer.issue(user))
    }

    /**
     * Checks that a session token still belongs to an existing user and has not been invalidated (password
     * change, "log out everywhere"). Called for every authenticated request.
     */
    fun requireActiveSession(userId: UserId, sessionVersion: Int): User {
        val user = users.findById(userId)
        if (user == null || user.sessionVersion != sessionVersion) {
            throw DomainException(ErrorKind.UNAUTHORIZED, "SESSION_EXPIRED", "Session is no longer valid")
        }
        return user
    }

    /** Sliding session: exchanges a still valid token for a fresh one. */
    fun refresh(user: User): AuthResult = AuthResult(user, tokenIssuer.issue(user))

    fun verifyEmail(rawToken: String): AuthResult {
        requireEmailEnabled()
        val hash = SecretTokens.hash(rawToken)
        val found = users.findByVerificationTokenHash(hash) ?: throw invalidToken("verification")
        val verified = locks.withLock(found.id) {
            // Re-read under the lock: the token may have been used or replaced meanwhile.
            val user = users.findById(found.id)
            val token = user?.emailVerification
            if (user == null || token == null || token.hash != hash || !token.isValidAt(clock.instant())) {
                throw invalidToken("verification")
            }
            user.copy(emailVerified = true, emailVerification = null).also(users::save)
        }
        return AuthResult(verified, tokenIssuer.issue(verified))
    }

    fun resendVerification(email: String) {
        requireEmailEnabled()
        val user = runCatching { users.findByEmail(Email.of(email)) }.getOrNull() ?: return
        if (!user.emailVerified) {
            sendVerificationMail(user)
        }
    }

    fun requestPasswordReset(email: String) {
        requireEmailEnabled()
        val user = runCatching { users.findByEmail(Email.of(email)) }.getOrNull() ?: return
        val rawToken = SecretTokens.newRawToken()
        val updated = update(user.id) { it.copy(passwordReset = pendingToken(rawToken, resetTtlMinutes)) } ?: return
        emailSender.sendPasswordReset(updated.email, updated.displayName, updated.settings.language, rawToken)
    }

    fun resetPassword(rawToken: String, newPassword: String): AuthResult {
        requireEmailEnabled()
        Passwords.validate(newPassword)
        val hash = SecretTokens.hash(rawToken)
        val found = users.findByPasswordResetTokenHash(hash) ?: throw invalidToken("reset")
        val updated = locks.withLock(found.id) {
            // Re-read under the lock: a link must work only once, also for two clicks at the same time.
            val user = users.findById(found.id)
            val token = user?.passwordReset
            if (user == null || token == null || token.hash != hash || !token.isValidAt(clock.instant())) {
                throw invalidToken("reset")
            }
            // Following the emailed link proves ownership of the address, so it also verifies it.
            user.withNewPassword(Passwords.hash(newPassword))
                .copy(emailVerified = true, emailVerification = null)
                .also(users::save)
        }
        return AuthResult(updated, tokenIssuer.issue(updated))
    }

    private fun sendVerificationMail(user: User): User {
        val rawToken = SecretTokens.newRawToken()
        val updated = update(user.id) { it.copy(emailVerification = pendingToken(rawToken, verificationTtlMinutes)) } ?: return user
        emailSender.sendVerification(updated.email, updated.displayName, updated.settings.language, rawToken)
        return updated
    }

    /** Load-modify-save under the user's lock; null if the user was deleted meanwhile. */
    private fun update(userId: UserId, change: (User) -> User): User? = locks.withLock(userId) {
        users.findById(userId)?.let(change)?.also(users::save)
    }

    private fun invalidToken(kind: String) =
        DomainException(ErrorKind.VALIDATION, "INVALID_TOKEN", "Invalid or expired $kind link")

    private fun pendingToken(rawToken: String, ttlMinutes: Long) =
        PendingToken(SecretTokens.hash(rawToken), clock.instant().plus(Duration.ofMinutes(ttlMinutes)))

    private fun requireEmailEnabled() {
        if (emailDisabled) {
            throw DomainException(ErrorKind.UNAVAILABLE, "EMAIL_DISABLED", "Email features are disabled on this server")
        }
    }
}
