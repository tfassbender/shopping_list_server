package com.tfassbender.shoppinglist.e2e

import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import java.util.UUID

/** Register → login → me against a running backend in dev mode (email verification disabled). */
class AuthE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    @Test
    fun `register, login and read own account`() {
        val email = "e2e-${UUID.randomUUID()}@example.com"
        given().contentType(ContentType.JSON)
            .body(mapOf("email" to email, "displayName" to "E2E User", "password" to "secret-password"))
            .post("/api/auth/register")
            .then().statusCode(201)

        val token: String = given().contentType(ContentType.JSON)
            .body(mapOf("email" to email, "password" to "secret-password"))
            .post("/api/auth/login")
            .then().statusCode(200).extract().path("token")

        given().auth().oauth2(token).get("/api/users/me")
            .then().statusCode(200)
            .body("email", equalTo(email))
            .body("displayName", equalTo("E2E User"))
    }
}
