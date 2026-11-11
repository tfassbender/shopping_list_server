package com.tfassbender.shoppinglist.e2e

import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.contains
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** An "AI agent" adds an item with a personal API token; a read-only token can't. */
class ApiTokenE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    private fun token(user: E2eUser, scope: String): String =
        user.request().body(mapOf("name" to "Agent", "scope" to scope)).post("/api/users/me/api-tokens")
            .then().statusCode(201).extract().path("rawToken")

    @Test
    fun `agent uses the API with a personal token`() {
        val user = E2eUsers.register("Owner")
        val spaceId: String = user.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
        val listId: String = user.request().body(mapOf("name" to "Groceries")).post("/api/spaces/$spaceId/lists").then().extract().path("id")
        val items = "/api/spaces/$spaceId/lists/$listId/items"

        val agent = given().contentType(ContentType.JSON).auth().oauth2(token(user, "FULL"))
        agent.body(mapOf("name" to "Coffee")).post(items).then().statusCode(201)

        val reader = given().contentType(ContentType.JSON).auth().oauth2(token(user, "READ"))
        reader.body(mapOf("name" to "Tea")).post(items).then().statusCode(403)
        reader.get("/api/spaces/$spaceId/lists/$listId").then().statusCode(200).body("items.name", contains("Coffee"))
    }
}
