package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.auth.ApiTokenService
import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.TokenScope
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.ResponseStatus
import java.time.Duration
import java.time.Instant

data class CreateApiTokenRequest(
    val name: String = "",
    val scope: TokenScope = TokenScope.READ,
    @field:Schema(description = "Validity in days (1-3650); null = never expires")
    val expiresInDays: Long? = null,
)

data class ApiTokenDto(
    val id: String,
    val name: String,
    val scope: TokenScope,
    val createdAt: Instant,
    val expiresAt: Instant?,
    val lastUsedAt: Instant?,
) {
    companion object {
        fun from(token: ApiToken) = ApiTokenDto(token.id.value, token.name, token.scope, token.createdAt, token.expiresAt, token.lastUsedAt)
    }
}

data class CreatedApiTokenDto(
    val token: ApiTokenDto,
    @field:Schema(description = "The raw token - shown only once. Send it as `Authorization: Bearer <token>`.")
    val rawToken: String,
)

/**
 * Personal API tokens for AI agents and scripts. Managing them requires a login session (JWT) – an API
 * token can't create or list tokens.
 */
@Path("/api/users/me/api-tokens")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(SESSION_ROLE)
@Tag(name = "API tokens", description = "Personal tokens for AI agents (requires a login session)")
class ApiTokenResource(
    private val apiTokens: ApiTokenService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "listApiTokens", summary = "The caller's API tokens (without the secret)")
    fun list(): List<ApiTokenDto> = apiTokens.list(currentUser.id()).map(ApiTokenDto::from)

    @POST
    @Operation(operationId = "createApiToken", summary = "Create an API token; the raw token is returned only once")
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = CreatedApiTokenDto::class))])
    fun create(request: CreateApiTokenRequest): CreatedApiTokenDto {
        val created = apiTokens.create(currentUser.id(), request.name, request.scope, request.expiresInDays?.let { Duration.ofDays(it.coerceIn(-1L, 1_000_000L)) })
        return CreatedApiTokenDto(ApiTokenDto.from(created.token), created.rawToken)
    }

    @DELETE
    @Path("/{tokenId}")
    @Operation(operationId = "revokeApiToken", summary = "Revoke an API token immediately")
    fun revoke(@PathParam("tokenId") tokenId: String) {
        apiTokens.revoke(currentUser.id(), ApiTokenId(tokenId))
    }
}
