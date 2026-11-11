package com.tfassbender.shoppinglist.application.auth

import at.favre.lib.crypto.bcrypt.BCrypt
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64

/**
 * Random single-use tokens (email verification, password reset, invites, API tokens). Only the SHA-256
 * hash is persisted, so a leaked data file can't be replayed. A plain utility, not a port: no external
 * system is involved.
 */
object SecretTokens {
    private const val TOKEN_BYTES = 32
    private val random = SecureRandom()
    private val encoder = Base64.getUrlEncoder().withoutPadding()

    fun newRawToken(): String {
        val bytes = ByteArray(TOKEN_BYTES)
        random.nextBytes(bytes)
        return encoder.encodeToString(bytes)
    }

    fun hash(rawToken: String): String =
        MessageDigest.getInstance("SHA-256")
            .digest(rawToken.toByteArray(Charsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
}

/** BCrypt password hashing (cost 10) plus the password rules. */
object Passwords {
    const val MIN_LENGTH = 8

    /** BCrypt only hashes 72 bytes and throws beyond; validated upfront so it is a clean 400. */
    const val MAX_BYTES = 72
    private const val COST = 10

    fun validate(password: String) {
        if (password.length < MIN_LENGTH) {
            throw DomainException(ErrorKind.VALIDATION, "PASSWORD_TOO_SHORT", "Password needs at least $MIN_LENGTH characters")
        }
        if (password.toByteArray(Charsets.UTF_8).size > MAX_BYTES) {
            throw DomainException(ErrorKind.VALIDATION, "PASSWORD_TOO_LONG", "Password must be at most $MAX_BYTES bytes")
        }
    }

    fun hash(password: String): String = BCrypt.withDefaults().hashToString(COST, password.toCharArray())

    fun matches(password: String, hash: String): Boolean =
        password.toByteArray(Charsets.UTF_8).size <= MAX_BYTES &&
            BCrypt.verifyer().verify(password.toCharArray(), hash).verified
}
