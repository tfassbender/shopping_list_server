package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.quarkus.test.junit.QuarkusTestProfile
import io.quarkus.test.junit.TestProfile
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test

/** The rate limits are off in tests (many registrations from one address); this profile switches them on. */
class RateLimitsOn : QuarkusTestProfile {
    override fun getConfigOverrides() = mapOf("shoppinglist.rate-limit.enabled" to "true")
}

@QuarkusTest
@TestProfile(RateLimitsOn::class)
class AuthRateLimitsTest {

    @Test
    fun `too many logins from one address are refused with 429`() {
        val login = { given().contentType(ContentType.JSON).body(mapOf("email" to "nobody@example.com", "password" to "wrong")).post("/api/auth/login") }
        repeat(20) { login().then().statusCode(401) }

        login().then().statusCode(429)
            .body("code", equalTo("TOO_MANY_REQUESTS"))
            .header("Retry-After", notNullValue())
        // other endpoints are not affected
        given().get("/api/health").then().statusCode(200)
    }

    @Test
    fun `behind Cloudflare each client address has its own budget`() {
        val register = { ip: String ->
            given().contentType(ContentType.JSON).header("CF-Connecting-IP", ip)
                .body(mapOf("email" to "x", "password" to "x", "displayName" to "x")).post("/api/auth/register")
        }
        repeat(10) { register("203.0.113.7").then().statusCode(400) }

        register("203.0.113.7").then().statusCode(429)
        register("203.0.113.8").then().statusCode(400)
    }
}
