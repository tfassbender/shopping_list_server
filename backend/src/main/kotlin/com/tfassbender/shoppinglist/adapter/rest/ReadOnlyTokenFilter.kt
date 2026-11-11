package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.auth.Roles
import io.quarkus.security.identity.SecurityIdentity
import jakarta.annotation.Priority
import jakarta.ws.rs.Priorities
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.container.ContainerRequestFilter
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import jakarta.ws.rs.ext.Provider

/**
 * Read-only API tokens may only read: every request with another method than GET/HEAD/OPTIONS is
 * rejected with 403 `READ_ONLY_TOKEN`, whatever endpoint it targets – so new endpoints are safe by default.
 */
@Provider
@Priority(Priorities.AUTHORIZATION)
class ReadOnlyTokenFilter(private val identity: SecurityIdentity) : ContainerRequestFilter {

    override fun filter(request: ContainerRequestContext) {
        if (request.method.uppercase() !in SAFE_METHODS && identity.hasRole(Roles.READ_ONLY)) {
            request.abortWith(
                Response.status(Response.Status.FORBIDDEN)
                    .type(MediaType.APPLICATION_JSON)
                    .entity(ErrorResponse("READ_ONLY_TOKEN", "This API token may only read"))
                    .build(),
            )
        }
    }

    private companion object {
        val SAFE_METHODS = setOf("GET", "HEAD", "OPTIONS")
    }
}
