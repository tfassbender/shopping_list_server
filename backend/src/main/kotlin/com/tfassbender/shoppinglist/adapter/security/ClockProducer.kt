package com.tfassbender.shoppinglist.adapter.security

import jakarta.enterprise.context.ApplicationScoped
import jakarta.enterprise.inject.Produces
import java.time.Clock

/**
 * `java.time.Clock` serves as the clock port: it is part of the JDK (no framework), and tests pass a
 * `Clock.fixed(...)`. A custom interface would add nothing.
 */
@ApplicationScoped
class ClockProducer {
    @Produces
    @ApplicationScoped
    fun clock(): Clock = Clock.systemUTC()
}
