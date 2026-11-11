package com.tfassbender.shoppinglist.e2e

import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** Two members work on the same list; each sees the other's changes. */
class SharedListE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    @Test
    fun `two users share a list`() {
        val anna = E2eUsers.register("Anna")
        val bob = E2eUsers.register("Bob")
        val spaceId: String = anna.request().body(mapOf("name" to "Flat")).post("/api/spaces").then().extract().path("id")
        val token: String = anna.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites").then().extract().path("token")
        bob.request().post("/api/invites/$token/accept").then().statusCode(200)

        val lists = "/api/spaces/$spaceId/lists"
        val listId: String = anna.request().body(mapOf("name" to "Groceries")).post(lists).then().statusCode(201).extract().path("id")
        anna.request().body(mapOf("name" to "Milk", "id" to "milk-1")).post("$lists/$listId/items").then().statusCode(201)
        bob.request().body(mapOf("name" to "Bread", "id" to "bread-1")).post("$lists/$listId/items").then().statusCode(201)
        bob.request().post("$lists/$listId/items/milk-1/check").then().statusCode(200)

        anna.request().get("$lists/$listId").then().statusCode(200)
            .body("items.name", contains("Milk", "Bread"))
            .body("items.find { it.id == 'milk-1' }.checked", equalTo(true))

        anna.request().post("$lists/$listId/remove-checked").then().statusCode(200)
        bob.request().get("$lists/$listId").then().body("items.name", contains("Bread"))
    }
}
