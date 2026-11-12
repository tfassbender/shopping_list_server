package com.tfassbender.shoppinglist.adapter.rest

import io.vertx.core.http.HttpServerRequest
import jakarta.enterprise.context.ApplicationScoped
import jakarta.ws.rs.container.ContainerRequestContext
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.jboss.resteasy.reactive.server.ServerRequestFilter
import java.time.Clock
import java.time.Duration
import java.time.Instant
import java.util.concurrent.ConcurrentHashMap

/**
 * Limits how often one client address may call the endpoints worth abusing: guessing passwords (login),
 * creating accounts, and sending emails (each costs a mail and lands in someone's inbox). Answers 429
 * `TOO_MANY_REQUESTS` with `Retry-After`. In memory, so it fits the single-instance deployment.
 *
 * The client address: behind Cloudflare its `CF-Connecting-IP` header. Cloudflare sets it itself, while
 * a client can put any value into `X-Forwarded-For` (Cloudflare only appends the real address). Without
 * that header, the connection's address (the app itself only listens on localhost). Off in dev, tests and
 * e2e runs, which register many users from one address.
 */
@ApplicationScoped
class AuthRateLimits(
    clock: Clock,
    @param:ConfigProperty(name = "shoppinglist.rate-limit.enabled")
    private val enabled: Boolean,
) {
    private val emails = RateLimiter(limit = 5, window = Duration.ofHours(1), clock)
    private val limiters = mapOf(
        "/api/auth/login" to RateLimiter(limit = 20, window = Duration.ofMinutes(10), clock),
        "/api/auth/register" to RateLimiter(limit = 10, window = Duration.ofHours(1), clock),
        // One budget for both: each of them sends an email.
        "/api/auth/resend-verification" to emails,
        "/api/auth/forgot-password" to emails,
    )

    @ServerRequestFilter(preMatching = true)
    fun limit(context: ContainerRequestContext, request: HttpServerRequest): Response? {
        if (!enabled || context.method != "POST") return null
        val limiter = limiters[context.uriInfo.path.trimEnd('/')] ?: return null
        val client = context.getHeaderString("CF-Connecting-IP") ?: request.remoteAddress()?.hostAddress() ?: "unknown"
        val wait = limiter.tryAcquire(client) ?: return null
        return Response.status(TOO_MANY_REQUESTS)
            .header("Retry-After", wait.toSeconds() + 1)
            .type(MediaType.APPLICATION_JSON)
            .entity(ErrorResponse("TOO_MANY_REQUESTS", "Too many requests, try again in ${wait.toMinutes() + 1} minutes"))
            .build()
    }

    private companion object {
        const val TOO_MANY_REQUESTS = 429
    }
}

/** At most [limit] requests per key within any [window] (sliding window over the request times). */
class RateLimiter(private val limit: Int, private val window: Duration, private val clock: Clock) {
    private val requests = ConcurrentHashMap<String, ArrayDeque<Instant>>()

    /** Counts a request of [key]: `null` if it is allowed, otherwise how long until the next one is. */
    fun tryAcquire(key: String): Duration? {
        val now = clock.instant()
        if (requests.size > MAX_KEYS) forgetIdle(now)
        val times = requests.computeIfAbsent(key) { ArrayDeque() }
        synchronized(times) {
            dropExpired(times, now)
            if (times.size >= limit) return Duration.between(now, times.first().plus(window))
            times.addLast(now)
            return null
        }
    }

    private fun dropExpired(times: ArrayDeque<Instant>, now: Instant) {
        while (times.isNotEmpty() && !times.first().plus(window).isAfter(now)) times.removeFirst()
    }

    /** Keeps the map small when many addresses passed by: addresses without recent requests are dropped. */
    private fun forgetIdle(now: Instant) {
        requests.entries.removeIf { (_, times) -> synchronized(times) { dropExpired(times, now); times.isEmpty() } }
    }

    private companion object {
        const val MAX_KEYS = 10_000
    }
}
