package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.security.ForbiddenException
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.jboss.resteasy.reactive.server.ServerExceptionMapper

/**
 * Quarkus answers a failed `@RolesAllowed` check of an authenticated caller with an empty 403 (its own
 * mapper wins over [RestExceptionMapper]). The only role such a caller can lack is the session role:
 * API tokens may not manage tokens or the account. Say so with the usual JSON error body.
 */
class SecurityExceptionMappers {

    @ServerExceptionMapper
    fun forbidden(@Suppress("UNUSED_PARAMETER") exception: ForbiddenException): Response =
        Response.status(Response.Status.FORBIDDEN)
            .type(MediaType.APPLICATION_JSON)
            .entity(ErrorResponse("SESSION_REQUIRED", "Only possible when logged in with email and password, not with an API token"))
            .build()
}
