package com.tfassbender.shoppinglist.e2e

import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

class HealthE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    @Test
    fun `backend is up`() {
        given()
            .`when`().get("/api/health")
            .then()
            .statusCode(200)
            .body("status", equalTo("UP"))
    }
}
