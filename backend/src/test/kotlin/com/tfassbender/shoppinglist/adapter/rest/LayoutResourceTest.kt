package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@QuarkusTest
class LayoutResourceTest {

    private lateinit var user: TestUser
    private lateinit var spaceId: String
    private lateinit var listId: String

    @BeforeEach
    fun setUp() {
        user = TestUsers.register()
        spaceId = user.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
        listId = user.request().body(mapOf("name" to "Groceries")).post("/api/spaces/$spaceId/lists").then().extract().path("id")
        val items = "/api/spaces/$spaceId/lists/$listId/items"
        listOf("Milk" to "dairy", "Bread" to "bakery", "Apples" to "fruit-vegetables", "Cheese" to "dairy").forEach { (name, category) ->
            user.request().body(mapOf("name" to name, "id" to name.lowercase(), "categoryId" to category)).post(items).then().statusCode(201)
        }
    }

    private fun layouts() = "/api/spaces/$spaceId/layouts"
    private fun list() = "/api/spaces/$spaceId/lists/$listId"

    private fun createLayout(mode: String = "CATEGORIES"): String =
        user.request().body(mapOf("name" to "Aldi", "mode" to mode)).post(layouts())
            .then().statusCode(201).body("mode", equalTo(mode)).extract().path("id")

    @Test
    fun `list sorted by a category layout`() {
        val layoutId = createLayout()
        user.request().body(mapOf("entries" to listOf("bakery", "dairy", "fruit-vegetables"))).put("${layouts()}/$layoutId/category-order")
            .then().statusCode(200)

        user.request().queryParam("sort", layoutId).get(list()).then().statusCode(200)
            .body("sortedBy", equalTo(layoutId))
            .body("items.name", contains("Bread", "Cheese", "Milk", "Apples"))

        // unsorted: order of adding
        user.request().get(list()).then().body("sortedBy", nullValue()).body("items.name", contains("Milk", "Bread", "Apples", "Cheese"))
    }

    @Test
    fun `item layout, favorites and sorted mutation responses`() {
        val layoutId = createLayout("ITEMS")
        user.request().body(mapOf("entries" to listOf("Apples", "Milk", "Bread"))).put("${layouts()}/$layoutId/item-order").then().statusCode(200)
        user.request().body(mapOf("name" to "Cheese")).post("${layouts()}/$layoutId/favorites")
            .then().statusCode(200).body("names", contains("cheese"))

        // Cheese is unknown to the item order -> last, even as a favorite
        user.request().queryParam("sort", layoutId).post("${list()}/items/apples/check").then().statusCode(200)
            .body("items.name", contains("Milk", "Bread", "Cheese", "Apples")) // checked Apples to the end
            .body("items.find { it.name == 'Cheese' }.favorite", equalTo(true))

        user.request().queryParam("name", "cheese").delete("${layouts()}/$layoutId/favorites")
            .then().statusCode(200).body("names", hasSize<Any>(0))
    }

    @Test
    fun `layout CRUD and list connection`() {
        val layoutId = createLayout()
        user.request().body(mapOf("name" to "Rewe", "mode" to "ITEMS")).put("${layouts()}/$layoutId")
            .then().statusCode(200).body("name", equalTo("Rewe")).body("mode", equalTo("ITEMS"))
        user.request().put("${layouts()}/$layoutId/lists/$listId").then().statusCode(200).body("listIds", contains(listId))
        user.request().get(layouts()).then().body("[0].listIds", contains(listId))
        user.request().delete("${layouts()}/$layoutId/lists/$listId").then().statusCode(200).body("listIds", hasSize<Any>(0))
        user.request().delete("${layouts()}/$layoutId").then().statusCode(204)
        user.request().queryParam("sort", layoutId).get(list()).then().statusCode(404).body("code", equalTo("LAYOUT_NOT_FOUND"))
    }

    @Test
    fun `a layout can be copied`() {
        val layoutId = createLayout()
        user.request().put("${layouts()}/$layoutId/lists/$listId").then().statusCode(200)

        user.request().body(mapOf("name" to "Aldi Süd", "id" to "aldi-sued")).post("${layouts()}/$layoutId/copy")
            .then().statusCode(201)
            .body("id", equalTo("aldi-sued"))
            .body("name", equalTo("Aldi Süd"))
            .body("listIds", contains(listId))
        user.request().get(layouts()).then().body("id", hasItem("aldi-sued")).body("id", hasItem(layoutId))
        user.request().body(mapOf("name" to "")).post("${layouts()}/$layoutId/copy")
            .then().statusCode(400).body("code", equalTo("INVALID_NAME"))
    }

    @Test
    fun `strangers can't use layouts`() {
        val layoutId = createLayout()
        TestUsers.register().request().get("${layouts()}/$layoutId").then().statusCode(404)
    }
}
