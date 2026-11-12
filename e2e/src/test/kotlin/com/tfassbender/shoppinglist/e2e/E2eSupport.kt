package com.tfassbender.shoppinglist.e2e

import io.restassured.RestAssured
import org.junit.jupiter.api.Assumptions.assumeTrue
import java.net.HttpURLConnection
import java.net.URI

/**
 * Shared setup for e2e tests: points RestAssured at the running backend and skips the test when no
 * backend is reachable, so `./gradlew build` stays green without a running server.
 */
object E2eSupport {

    val baseUrl: String = System.getProperty("e2e.base-url", "http://localhost:4723")

    fun requireRunningBackend() {
        assumeTrue(isBackendReachable(), "Backend not reachable at $baseUrl - skipping e2e test")
        RestAssured.baseURI = baseUrl
    }

    private fun isBackendReachable(): Boolean = try {
        val connection = URI("$baseUrl/api/health").toURL().openConnection() as HttpURLConnection
        connection.connectTimeout = 2000
        // Generous: a backend in dev mode may be hot-reloading on the first request.
        connection.readTimeout = 10_000
        connection.responseCode == 200
    } catch (_: Exception) {
        false
    }
}
