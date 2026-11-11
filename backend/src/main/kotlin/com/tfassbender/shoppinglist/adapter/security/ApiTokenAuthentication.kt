package com.tfassbender.shoppinglist.adapter.security

import com.tfassbender.shoppinglist.application.auth.ApiTokenService
import com.tfassbender.shoppinglist.application.auth.Roles
import com.tfassbender.shoppinglist.domain.user.TokenScope
import io.quarkus.security.AuthenticationFailedException
import io.quarkus.security.identity.AuthenticationRequestContext
import io.quarkus.security.identity.IdentityProvider
import io.quarkus.security.identity.IdentityProviderManager
import io.quarkus.security.identity.SecurityIdentity
import io.quarkus.security.identity.request.AuthenticationRequest
import io.quarkus.security.identity.request.BaseAuthenticationRequest
import io.quarkus.security.runtime.QuarkusPrincipal
import io.quarkus.security.runtime.QuarkusSecurityIdentity
import io.quarkus.vertx.http.runtime.security.ChallengeData
import io.quarkus.vertx.http.runtime.security.HttpAuthenticationMechanism
import io.smallrye.mutiny.Uni
import io.vertx.ext.web.RoutingContext
import jakarta.enterprise.context.ApplicationScoped

/** Credentials of a request carrying an API token (`Authorization: Bearer slt_...`). */
class ApiTokenAuthenticationRequest(val token: String) : BaseAuthenticationRequest()

/**
 * Recognizes personal API tokens by their `slt_` prefix. It runs before the JWT mechanism (higher
 * priority) and returns "no identity" for any other bearer token, so JWTs are then handled as usual.
 */
@ApplicationScoped
class ApiTokenAuthMechanism : HttpAuthenticationMechanism {

    override fun authenticate(context: RoutingContext, identityProviderManager: IdentityProviderManager): Uni<SecurityIdentity> {
        val header = context.request().getHeader("Authorization")
        val token = header?.takeIf { it.startsWith(BEARER, ignoreCase = true) }?.substring(BEARER.length)?.trim()
        if (token == null || !ApiTokenService.looksLikeApiToken(token)) {
            return Uni.createFrom().nullItem()
        }
        return identityProviderManager.authenticate(ApiTokenAuthenticationRequest(token))
    }

    override fun getChallenge(context: RoutingContext): Uni<ChallengeData> =
        Uni.createFrom().item(ChallengeData(401, "WWW-Authenticate", "Bearer"))

    override fun getCredentialTypes(): Set<Class<out AuthenticationRequest>> = setOf(ApiTokenAuthenticationRequest::class.java)

    override fun getPriority(): Int = HttpAuthenticationMechanism.DEFAULT_PRIORITY + 1000

    private companion object {
        const val BEARER = "Bearer "
    }
}

/** Turns a valid API token into an identity acting as its user; read-only tokens get [Roles.READ_ONLY]. */
@ApplicationScoped
class ApiTokenIdentityProvider(private val apiTokens: ApiTokenService) : IdentityProvider<ApiTokenAuthenticationRequest> {

    override fun getRequestType(): Class<ApiTokenAuthenticationRequest> = ApiTokenAuthenticationRequest::class.java

    override fun authenticate(request: ApiTokenAuthenticationRequest, context: AuthenticationRequestContext): Uni<SecurityIdentity> =
        // Reading the token file is blocking I/O: not on the event loop.
        context.runBlocking {
            val caller = apiTokens.authenticate(request.token) ?: throw AuthenticationFailedException("Invalid API token")
            val builder = QuarkusSecurityIdentity.builder()
                .setPrincipal(QuarkusPrincipal(caller.userId.value))
                .addRole(Roles.USER)
            if (caller.scope == TokenScope.READ) builder.addRole(Roles.READ_ONLY)
            builder.build()
        }
}
