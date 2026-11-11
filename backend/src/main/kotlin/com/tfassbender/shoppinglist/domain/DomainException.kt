package com.tfassbender.shoppinglist.domain

/**
 * The kind of a rejected operation. It is HTTP-agnostic on purpose: the REST adapter maps each kind to a
 * status code, so the domain and application layers never deal with HTTP.
 */
enum class ErrorKind {
    VALIDATION,
    UNAUTHORIZED,
    FORBIDDEN,
    NOT_FOUND,
    CONFLICT,
    UNAVAILABLE,
}

/**
 * Base class of all expected (business) errors. [code] is a stable, machine-readable identifier
 * (e.g. `LIST_NOT_FOUND`) that clients use for translated error messages; [message] is for logs and tests.
 */
open class DomainException(
    val kind: ErrorKind,
    val code: String,
    message: String,
) : RuntimeException(message)
