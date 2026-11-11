package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.domain.user.UserId
import io.quarkus.security.identity.SecurityIdentity
import jakarta.enterprise.context.ApplicationScoped

/** The authenticated caller of the current request. Only valid in `@RolesAllowed` endpoints. */
@ApplicationScoped
class CurrentUser(private val identity: SecurityIdentity) {
    fun id(): UserId = UserId(identity.principal.name)
}

/** Role every logged-in user has (JWT group). */
const val USER_ROLE = "user"
