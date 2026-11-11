package com.tfassbender.shoppinglist.application.port

import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.User
import java.time.Instant

/** A signed session token and the moment it stops being accepted (clients refresh before that). */
data class SessionToken(val value: String, val expiresAt: Instant)

/** Issues session tokens (JWT). Verification is done by the framework in the adapter layer. */
interface TokenIssuer {
    fun issue(user: User): SessionToken
}

/** Sends account emails. The raw token goes into a link; only its hash is stored. */
interface EmailSender {
    fun sendVerification(to: Email, displayName: String, language: Language, rawToken: String)
    fun sendPasswordReset(to: Email, displayName: String, language: Language, rawToken: String)
}
