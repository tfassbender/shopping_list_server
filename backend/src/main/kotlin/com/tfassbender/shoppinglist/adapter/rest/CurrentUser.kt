package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.auth.Roles
import com.tfassbender.shoppinglist.domain.user.UserId
import io.quarkus.security.identity.SecurityIdentity
import jakarta.enterprise.context.ApplicationScoped

/** The authenticated caller of the current request. Only valid in `@RolesAllowed` endpoints. */
@ApplicationScoped
class CurrentUser(private val identity: SecurityIdentity) {
    fun id(): UserId = UserId(identity.principal.name)
}

/** Every authenticated caller (session or API token). */
const val USER_ROLE = Roles.USER

/** Only real login sessions (JWT) - not API tokens: account and token management. */
const val SESSION_ROLE = Roles.SESSION
