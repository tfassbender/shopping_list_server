package com.tfassbender.shoppinglist.domain

/** Client-generated ids (UUIDs) must be simple tokens: they become file names and URL segments. */
private val CLIENT_ID = Regex("^[A-Za-z0-9_-]{1,64}$")

internal fun requireClientId(value: String, kind: String) {
    if (!CLIENT_ID.matches(value)) {
        throw DomainException(ErrorKind.VALIDATION, "INVALID_ID", "Invalid $kind id: '$value'")
    }
}
