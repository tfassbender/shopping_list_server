package com.tfassbender.shoppinglist.e2e

import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import io.restassured.specification.RequestSpecification
import java.util.UUID

/** A freshly registered user for multi-user e2e flows. */
data class E2eUser(val id: String, val email: String, val token: String) {
    fun request(): RequestSpecification = given().contentType(ContentType.JSON).auth().oauth2(token)
}

object E2eUsers {
    fun register(displayName: String): E2eUser {
        val email = "e2e-${UUID.randomUUID()}@example.com"
        val response = given().contentType(ContentType.JSON)
            .body(mapOf("email" to email, "displayName" to displayName, "password" to "secret-password"))
            .post("/api/auth/register")
            .then().statusCode(201).extract()
        return E2eUser(response.path("user.id"), email, response.path("token"))
    }
}
