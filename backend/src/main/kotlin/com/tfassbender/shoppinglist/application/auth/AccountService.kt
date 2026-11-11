package com.tfassbender.shoppinglist.application.auth

import com.tfassbender.shoppinglist.application.port.TokenIssuer
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import jakarta.enterprise.context.ApplicationScoped

/** Use cases of the logged-in user on their own account (profile, settings, password, sessions). */
@ApplicationScoped
class AccountService(
    private val users: UserRepository,
    private val tokenIssuer: TokenIssuer,
) {

    fun me(userId: UserId): User = load(userId)

    fun updateSettings(userId: UserId, settings: UserSettings): User =
        update(userId) { it.copy(settings = settings) }

    fun rename(userId: UserId, displayName: String): User = update(userId) { it.rename(displayName) }

    /** Changes the password and logs out all other sessions; the returned session replaces the current one. */
    fun changePassword(userId: UserId, currentPassword: String, newPassword: String): AuthResult {
        val user = load(userId)
        if (!Passwords.matches(currentPassword, user.passwordHash)) {
            throw DomainException(ErrorKind.VALIDATION, "WRONG_PASSWORD", "Current password is incorrect")
        }
        Passwords.validate(newPassword)
        val updated = user.withNewPassword(Passwords.hash(newPassword))
        users.save(updated)
        return AuthResult(updated, tokenIssuer.issue(updated))
    }

    /** Invalidates every session (e.g. a lost phone); the caller gets a fresh token to stay logged in. */
    fun logoutEverywhere(userId: UserId): AuthResult {
        val updated = update(userId) { it.invalidateSessions() }
        return AuthResult(updated, tokenIssuer.issue(updated))
    }

    private fun update(userId: UserId, change: (User) -> User): User {
        val updated = change(load(userId))
        users.save(updated)
        return updated
    }

    private fun load(userId: UserId): User = users.findById(userId)
        ?: throw DomainException(ErrorKind.NOT_FOUND, "USER_NOT_FOUND", "No user ${userId.value}")
}
