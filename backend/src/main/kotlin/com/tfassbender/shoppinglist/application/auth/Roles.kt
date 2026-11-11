package com.tfassbender.shoppinglist.application.auth

/**
 * Role names of an authenticated caller, shared by the security adapter (which grants them) and the REST
 * adapter (which checks them):
 * - [USER]: every authenticated caller (session or API token),
 * - [SESSION]: logged in with email/password (JWT) – required for account and token management, so an
 *   API token can't create tokens or delete the account,
 * - [READ_ONLY]: a read-only API token; mutating requests are rejected.
 */
object Roles {
    const val USER = "user"
    const val SESSION = "session"
    const val READ_ONLY = "read-only"
}
