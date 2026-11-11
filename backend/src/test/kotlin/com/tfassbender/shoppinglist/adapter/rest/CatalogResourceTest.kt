package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.hasItems
import org.hamcrest.Matchers.not
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@QuarkusTest
class CatalogResourceTest {

    private lateinit var user: TestUser
    private lateinit var spaceId: String

    @BeforeEach
    fun setUp() {
        user = TestUsers.register(language = "de")
        spaceId = user.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
    }

    private fun catalog() = "/api/spaces/$spaceId/catalog"

    @Test
    fun `new spaces have German defaults for a German user`() {
        user.request().get(catalog()).then().statusCode(200)
            .body("categories.name", hasItem("Obst & Gemüse"))
            .body("units", hasItems("Stk", "x"))
    }

    @Test
    fun `category CRUD and order`() {
        user.request().body(mapOf("name" to "Snacks", "color" to "#123456", "id" to "snacks")).post("${catalog()}/categories")
            .then().statusCode(201).body("categories.id", hasItem("snacks"))
        user.request().body(mapOf("name" to "Chips", "color" to "#654321")).put("${catalog()}/categories/snacks")
            .then().statusCode(200).body("categories.find { it.id == 'snacks' }.name", equalTo("Chips"))

        val ids: List<String> = user.request().get(catalog()).then().extract().path("categories.id")
        user.request().body(mapOf("ids" to ids.reversed())).put("${catalog()}/categories/order")
            .then().statusCode(200).body("categories[0].id", equalTo("snacks"))

        user.request().delete("${catalog()}/categories/snacks").then().statusCode(200).body("categories.id", not(hasItem("snacks")))
        user.request().body(mapOf("name" to "X", "color" to "blue")).post("${catalog()}/categories")
            .then().statusCode(400).body("code", equalTo("INVALID_COLOR"))
    }

    @Test
    fun `units can be replaced`() {
        user.request().body(mapOf("units" to listOf("Stk", "Kiste"))).put("${catalog()}/units")
            .then().statusCode(200).body("units", contains("Stk", "Kiste"))
    }

    @Test
    fun `suggestions come from added and checked items, with category`() {
        val listId: String = user.request().body(mapOf("name" to "Einkauf")).post("/api/spaces/$spaceId/lists").then().extract().path("id")
        val items = "/api/spaces/$spaceId/lists/$listId/items"
        user.request().body(mapOf("name" to "Milch", "id" to "m1", "categoryId" to "dairy", "unit" to "l")).post(items).then().statusCode(201)
        user.request().post("$items/m1/check").then().statusCode(200)

        user.request().queryParam("q", "mi").get("${catalog()}/suggestions").then().statusCode(200)
            .body("[0].name", equalTo("Milch"))
            .body("[0].categoryId", equalTo("dairy"))
            .body("[0].unit", equalTo("l"))
            .body("[0].usageCount", equalTo(1))
        user.request().get(catalog()).then().body("usage.milch", equalTo(1))

        // auto-placement: same name again without a category
        user.request().body(mapOf("name" to "milch", "id" to "m2")).post(items)
            .then().statusCode(201).body("items.find { it.id == 'm2' }.categoryId", equalTo("dairy"))
    }

    @Test
    fun `the item history can be listed, renamed and cleaned up`() {
        val listId: String = user.request().body(mapOf("name" to "Einkauf")).post("/api/spaces/$spaceId/lists").then().extract().path("id")
        val items = "/api/spaces/$spaceId/lists/$listId/items"
        user.request().body(mapOf("name" to "Mlich", "id" to "m1", "categoryId" to "dairy")).post(items).then().statusCode(201)
        user.request().body(mapOf("name" to "Brot/Brötchen", "id" to "b1")).post(items).then().statusCode(201)

        user.request().get("${catalog()}/history").then().statusCode(200)
            .body("name", contains("Brot/Brötchen", "Mlich"))
            .body("[1].categoryId", equalTo("dairy"))

        user.request().queryParam("name", "mlich").body(mapOf("name" to "Milch")).put("${catalog()}/history")
            .then().statusCode(200).body("name", contains("Brot/Brötchen", "Milch"))
        user.request().queryParam("q", "mi").get("${catalog()}/suggestions").then().body("[0].name", equalTo("Milch"))

        // names with a slash work because they are passed as query parameter
        user.request().queryParam("name", "Brot/Brötchen").delete("${catalog()}/history")
            .then().statusCode(200).body("name", contains("Milch"))
        user.request().queryParam("name", "Brot/Brötchen").delete("${catalog()}/history")
            .then().statusCode(404).body("code", equalTo("HISTORY_ENTRY_NOT_FOUND"))
        user.request().queryParam("name", "Milch").body(mapOf("name" to " ")).put("${catalog()}/history")
            .then().statusCode(400).body("code", equalTo("INVALID_NAME"))
    }

    @Test
    fun `strangers can't read the catalog`() {
        TestUsers.register().request().get(catalog()).then().statusCode(404)
    }
}
