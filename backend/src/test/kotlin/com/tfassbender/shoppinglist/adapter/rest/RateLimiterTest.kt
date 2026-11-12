package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.MutableClock
import org.junit.jupiter.api.Test
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertNull

class RateLimiterTest {

    private val clock = MutableClock()
    private val limiter = RateLimiter(limit = 3, window = Duration.ofMinutes(10), clock)

    @Test
    fun `allows the limit within the window, then says how long to wait`() {
        repeat(3) {
            assertNull(limiter.tryAcquire("1.2.3.4"))
            clock.advance(Duration.ofMinutes(1))
        }

        // the first request (3 minutes ago) leaves the window in 7 minutes
        assertEquals(Duration.ofMinutes(7), limiter.tryAcquire("1.2.3.4"))
        // other addresses have their own budget
        assertNull(limiter.tryAcquire("5.6.7.8"))
    }

    @Test
    fun `the window slides - each request counts for exactly the window length`() {
        repeat(3) { limiter.tryAcquire("a") }
        clock.advance(Duration.ofMinutes(10))

        assertNull(limiter.tryAcquire("a"))
    }

    @Test
    fun `refused requests don't extend the wait`() {
        repeat(3) { limiter.tryAcquire("a") }
        clock.advance(Duration.ofMinutes(5))
        repeat(5) { limiter.tryAcquire("a") }

        clock.advance(Duration.ofMinutes(5))
        assertNull(limiter.tryAcquire("a"))
    }
}
