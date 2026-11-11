package com.tfassbender.shoppinglist.adapter.security

import com.tfassbender.shoppinglist.application.port.SessionToken
import com.tfassbender.shoppinglist.application.port.TokenIssuer
import com.tfassbender.shoppinglist.domain.user.User
import io.smallrye.jwt.build.Jwt
import jakarta.enterprise.context.ApplicationScoped
import org.eclipse.microprofile.config.inject.ConfigProperty
import java.time.Clock
import java.time.Duration

/**
 * Signs HS256 session JWTs. `upn`/`sub` = user id, group `user` (for `@RolesAllowed("user")`), and the
 * [SESSION_VERSION_CLAIM] so tokens can be invalidated server side. Verification is done by SmallRye JWT
 * from the `mp.jwt.*` config.
 */
@ApplicationScoped
class JwtTokenIssuer(
    @param:ConfigProperty(name = "mp.jwt.verify.issuer")
    private val issuer: String,
    @param:ConfigProperty(name = "shoppinglist.auth.jwt.expiration-days", defaultValue = "30")
    private val expirationDays: Long,
    private val clock: Clock,
) : TokenIssuer {

    override fun issue(user: User): SessionToken {
        val now = clock.instant()
        val expiresAt = now.plus(Duration.ofDays(expirationDays))
        val token = Jwt.issuer(issuer)
            .upn(user.id.value)
            .subject(user.id.value)
            .groups(setOf(USER_ROLE))
            .claim(SESSION_VERSION_CLAIM, user.sessionVersion)
            .issuedAt(now)
            .expiresAt(expiresAt)
            .sign()
        return SessionToken(token, expiresAt)
    }

    companion object {
        const val USER_ROLE = "user"
        const val SESSION_VERSION_CLAIM = "sv"
    }
}
