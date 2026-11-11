package com.tfassbender.shoppinglist.e2e

import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** Two clients were offline, both changed the same list, then they sync: edit wins over delete. */
class OfflineSyncE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    @Test
    fun `two clients sync conflicting offline changes`() {
        val anna = E2eUsers.register("Anna")
        val bob = E2eUsers.register("Bob")
        val spaceId: String = anna.request().body(mapOf("name" to "Flat")).post("/api/spaces").then().extract().path("id")
        val token: String = anna.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites").then().extract().path("token")
        bob.request().post("/api/invites/$token/accept").then().statusCode(200)
        val changes = "/api/spaces/$spaceId/changes"

        anna.request().body(mapOf("changes" to listOf(
            mapOf("changeId" to "setup-1", "type" to "CREATE_LIST", "listId" to "l1", "name" to "Groceries"),
            mapOf("changeId" to "setup-2", "type" to "ADD_ITEM", "listId" to "l1", "itemId" to "milk", "name" to "Milk"),
        ))).post(changes).then().statusCode(200)
        val base: Int = bob.request().get(changes).then().extract().path("seq")

        // offline: Anna deletes milk, Bob sets its quantity; each adds something
        anna.request().body(mapOf("baseSeq" to base, "changes" to listOf(
            mapOf("changeId" to "a-1", "type" to "DELETE_ITEM", "listId" to "l1", "itemId" to "milk"),
            mapOf("changeId" to "a-2", "type" to "ADD_ITEM", "listId" to "l1", "itemId" to "tea", "name" to "Tea"),
        ))).post(changes).then().statusCode(200)
        bob.request().body(mapOf("baseSeq" to base, "changes" to listOf(
            mapOf("changeId" to "b-1", "type" to "EDIT_ITEM", "listId" to "l1", "itemId" to "milk", "field" to "QUANTITY", "value" to "2"),
            mapOf("changeId" to "b-2", "type" to "ADD_ITEM", "listId" to "l1", "itemId" to "coffee", "name" to "Coffee"),
        ))).post(changes).then().statusCode(200).body("warnings[0].type", equalTo("RESTORED"))

        anna.request().get("/api/spaces/$spaceId/lists/l1").then().statusCode(200)
            .body("items.name", containsInAnyOrder("Milk", "Tea", "Coffee"))
    }
}
