package com.tfassbender.shoppinglist.adapter.rest

import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import io.restassured.specification.RequestSpecification
import java.util.UUID

/** A registered user in a `@QuarkusTest`, with a helper to send authenticated requests. */
data class TestUser(val id: String, val email: String, val token: String, val password: String) {
    fun request(): RequestSpecification = given().contentType(ContentType.JSON).auth().oauth2(token)
}

object TestUsers {
    const val PASSWORD = "secret-password"

    /** Registers a user with a unique email (tests share one data dir) and returns its session. */
    fun register(displayName: String = "Tester", language: String = "en"): TestUser {
        val email = "user-${UUID.randomUUID()}@example.com"
        val response = given().contentType(ContentType.JSON)
            .body(mapOf("email" to email, "displayName" to displayName, "password" to PASSWORD, "language" to language))
            .post("/api/auth/register")
            .then().statusCode(201)
            .extract()
        return TestUser(response.path("user.id"), email, response.path("token"), PASSWORD)
    }
}
