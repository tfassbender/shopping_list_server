package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** JSON contract of the sync endpoints. The merge logic itself is covered by the domain/service tests. */
@QuarkusTest
class SyncResourceTest {

    private lateinit var anna: TestUser
    private lateinit var bob: TestUser
    private lateinit var spaceId: String

    @BeforeEach
    fun setUp() {
        anna = TestUsers.register("Anna")
        bob = TestUsers.register("Bob")
        spaceId = anna.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
        val token: String = anna.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites").then().extract().path("token")
        bob.request().post("/api/invites/$token/accept").then().statusCode(200)
    }

    private fun changes() = "/api/spaces/$spaceId/changes"

    private fun pullSeq(user: TestUser): Int = user.request().get(changes()).then().statusCode(200).extract().path("seq")

    @Test
    fun `offline client creates a list, adds items and pulls the result`() {
        val base = pullSeq(bob)
        bob.request().body(
            mapOf(
                "baseSeq" to base,
                "changes" to listOf(
                    mapOf("changeId" to "c1", "type" to "CREATE_LIST", "listId" to "list-1", "name" to "Offline"),
                    mapOf("changeId" to "c2", "type" to "ADD_ITEM", "listId" to "list-1", "itemId" to "item-1", "name" to "Milk", "quantity" to "2"),
                    mapOf("changeId" to "c3", "type" to "CHECK_ITEM", "listId" to "list-1", "itemId" to "item-1"),
                ),
            ),
        ).post(changes()).then().statusCode(200)
            .body("results.status", contains("APPLIED", "APPLIED", "APPLIED"))
            .body("warnings", hasSize<Any>(0))

        anna.request().queryParam("since", base).get(changes()).then().statusCode(200)
            .body("fullResync", equalTo(false))
            .body("listIds", contains("list-1"))
            .body("lists[0].name", equalTo("Offline"))
            .body("lists[0].items[0].checked", equalTo(true))
            .body("lists[0].items[0].deleted", equalTo(false))
            .body("catalog", equalTo(null))
            .body("historyChanges.name", contains("Milk"))
            .body("historyChanges[0].usageCount", equalTo(1))
    }

    @Test
    fun `conflicting offline edit returns a warning with names`() {
        val listId: String = anna.request().body(mapOf("name" to "Groceries")).post("/api/spaces/$spaceId/lists").then().extract().path("id")
        anna.request().body(mapOf("name" to "Milk", "id" to "milk")).post("/api/spaces/$spaceId/lists/$listId/items").then().statusCode(201)
        val base = pullSeq(bob)
        anna.request().delete("/api/spaces/$spaceId/lists/$listId/items/milk").then().statusCode(200)

        bob.request().body(
            mapOf(
                "baseSeq" to base,
                "changes" to listOf(mapOf("changeId" to "e1", "type" to "EDIT_ITEM", "listId" to listId, "itemId" to "milk", "field" to "QUANTITY", "value" to "3")),
            ),
        ).post(changes()).then().statusCode(200)
            .body("warnings[0].type", equalTo("RESTORED"))
            .body("warnings[0].itemName", equalTo("Milk"))
            .body("warnings[0].listName", equalTo("Groceries"))
            .body("warnings[0].byName", equalTo("Anna"))

        anna.request().get("/api/spaces/$spaceId/lists/$listId").then().body("items.quantity", contains("3"))
    }

    @Test
    fun `invalid changes are rejected one by one, duplicates recognized`() {
        val body = mapOf(
            "changes" to listOf(
                mapOf("changeId" to "x1", "type" to "ADD_ITEM", "listId" to "nope"),
                mapOf("changeId" to "x2", "listId" to "nope"),
                mapOf("changeId" to "x3", "type" to "CREATE_LIST", "listId" to "l-x", "name" to "Fine"),
            ),
        )
        bob.request().body(body).post(changes()).then().statusCode(200)
            .body("results.find { it.changeId == 'x1' }.status", equalTo("REJECTED"))
            .body("results.find { it.changeId == 'x2' }.code", equalTo("INVALID_CHANGE"))
            .body("results.find { it.changeId == 'x3' }.status", equalTo("APPLIED"))

        bob.request().body(mapOf("changes" to listOf(mapOf("changeId" to "x3", "type" to "CREATE_LIST", "listId" to "l-x", "name" to "Fine"))))
            .post(changes()).then().body("results[0].status", equalTo("DUPLICATE"))
    }

    @Test
    fun `full pull contains catalog, layouts and own favorites, strangers get 404`() {
        val layoutId: String = anna.request().body(mapOf("name" to "Aldi")).post("/api/spaces/$spaceId/layouts").then().statusCode(201)
            .extract().path("id")
        anna.request().body(mapOf("name" to "Milk")).post("/api/spaces/$spaceId/layouts/$layoutId/favorites").then().statusCode(200)
        anna.request().get(changes()).then().statusCode(200)
            .body("fullResync", equalTo(true))
            .body("catalog.categories", notNullValue())
            .body("layouts.name", containsInAnyOrder("Aldi"))
            .body("favorites['$layoutId']", contains("milk"))
        bob.request().get(changes()).then().statusCode(200).body("favorites.size()", equalTo(0))
        TestUsers.register().request().get(changes()).then().statusCode(404)
    }
}
