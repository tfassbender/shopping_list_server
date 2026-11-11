package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test

@QuarkusTest
class HealthResourceTest {

    @Test
    fun `health returns UP and the version`() {
        given()
            .`when`().get("/api/health")
            .then()
            .statusCode(200)
            .body("status", equalTo("UP"))
            .body("version", notNullValue())
    }

    @Test
    fun `unknown api route returns a JSON 404`() {
        given()
            .`when`().get("/api/does-not-exist")
            .then()
            .statusCode(404)
    }

    @Test
    fun `openapi spec is available`() {
        given()
            .`when`().get("/q/openapi?format=json")
            .then()
            .statusCode(200)
            .body("info.title", equalTo("Shopping List API"))
    }
}
