package com.tfassbender.shoppinglist.adapter.security

import com.tfassbender.shoppinglist.application.auth.AuthService
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.user.UserId
import io.quarkus.security.AuthenticationFailedException
import io.quarkus.security.identity.AuthenticationRequestContext
import io.quarkus.security.identity.SecurityIdentity
import io.quarkus.security.identity.SecurityIdentityAugmentor
import io.smallrye.mutiny.Uni
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.jwt.JsonWebToken
import jakarta.json.JsonNumber

/**
 * Runs after SmallRye JWT has verified a token's signature and expiry: rejects the token (401) if its user
 * no longer exists or its session version is outdated (password changed, "log out everywhere").
 * This keeps the stateless JWT revocable without a token blacklist.
 */
@ApplicationScoped
class SessionValidationAugmentor(
    private val authService: AuthService,
) : SecurityIdentityAugmentor {

    override fun augment(identity: SecurityIdentity, context: AuthenticationRequestContext): Uni<SecurityIdentity> {
        val jwt = identity.principal as? JsonWebToken ?: return Uni.createFrom().item(identity)
        // Reading the user file is blocking I/O; it must not run on the event loop.
        return context.runBlocking {
            try {
                authService.requireActiveSession(UserId(jwt.name), sessionVersion(jwt))
                identity
            } catch (e: DomainException) {
                throw AuthenticationFailedException(e.message, e)
            }
        }
    }

    private fun sessionVersion(jwt: JsonWebToken): Int =
        when (val claim = jwt.getClaim<Any?>(JwtTokenIssuer.SESSION_VERSION_CLAIM)) {
            is JsonNumber -> claim.intValue()
            is Number -> claim.toInt()
            else -> -1
        }
}
