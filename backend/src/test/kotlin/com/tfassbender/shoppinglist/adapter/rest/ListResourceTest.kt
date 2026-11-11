package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

@QuarkusTest
class ListResourceTest {

    private lateinit var owner: TestUser
    private lateinit var member: TestUser
    private lateinit var spaceId: String

    /** Owner + member in a fresh space (field initializers would run before RestAssured is configured). */
    @BeforeEach
    fun setUp() {
        owner = TestUsers.register()
        member = TestUsers.register()
        spaceId = owner.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
        val token: String = owner.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites").then().extract().path("token")
        member.request().post("/api/invites/$token/accept").then().statusCode(200)
    }

    private fun lists() = "/api/spaces/$spaceId/lists"

    private fun createList(user: TestUser = member, name: String = "Groceries"): String =
        user.request().body(mapOf("name" to name)).post(lists()).then().statusCode(201).extract().path("id")

    private fun addItem(listId: String, name: String, id: String? = null): String =
        member.request().body(mapOf("name" to name, "id" to id)).post("${lists()}/$listId/items")
            .then().statusCode(201).extract().path("items.find { it.name == '$name' }.id")

    @Test
    fun `create, rename and list lists`() {
        val listId = createList()
        member.request().body(mapOf("name" to "Weekend")).put("${lists()}/$listId/name")
            .then().statusCode(200).body("name", equalTo("Weekend"))
        owner.request().get(lists()).then().statusCode(200)
            .body("name", contains("Weekend")).body("[0].openItems", equalTo(0))
    }

    @Test
    fun `item lifecycle - add, edit, check, uncheck, delete`() {
        val listId = createList()
        val milk = addItem(listId, "Milk")

        member.request().body(mapOf("quantity" to "2", "unit" to "l", "note" to "low fat"))
            .patch("${lists()}/$listId/items/$milk")
            .then().statusCode(200)
            .body("items[0].quantity", equalTo("2")).body("items[0].unit", equalTo("l")).body("items[0].note", equalTo("low fat"))

        // explicit null clears, missing fields stay
        member.request().body("""{"note": null}""").patch("${lists()}/$listId/items/$milk")
            .then().statusCode(200).body("items[0].note", nullValue()).body("items[0].quantity", equalTo("2"))

        owner.request().post("${lists()}/$listId/items/$milk/check").then().statusCode(200).body("items[0].checked", equalTo(true))
        owner.request().post("${lists()}/$listId/items/$milk/uncheck").then().statusCode(200).body("items[0].checked", equalTo(false))
        member.request().delete("${lists()}/$listId/items/$milk").then().statusCode(200).body("items", hasSize<Any>(0))
        // edit wins over delete: checking the deleted item brings it back
        member.request().post("${lists()}/$listId/items/$milk/check").then().statusCode(200).body("items[0].checked", equalTo(true))
        member.request().post("${lists()}/$listId/items/unknown-item/check").then().statusCode(404).body("code", equalTo("ITEM_NOT_FOUND"))
    }

    @Test
    fun `remove checked keeps unchecked items`() {
        val listId = createList()
        val milk = addItem(listId, "Milk")
        addItem(listId, "Bread")
        member.request().post("${lists()}/$listId/items/$milk/check").then().statusCode(200)

        member.request().post("${lists()}/$listId/remove-checked").then().statusCode(200).body("items.name", contains("Bread"))
    }

    @Test
    fun `client generated ids are accepted, invalid ones rejected`() {
        val listId: String = member.request().body(mapOf("name" to "Offline", "id" to "3f1c2b9e-1111-4c2d-9a7e-000000000001"))
            .post(lists()).then().statusCode(201).extract().path("id")
        assertEqualsString("3f1c2b9e-1111-4c2d-9a7e-000000000001", listId)
        addItem(listId, "Milk", "item-uuid-1")
        member.request().body(mapOf("name" to "Milk", "id" to "item-uuid-1")).post("${lists()}/$listId/items")
            .then().statusCode(409).body("code", equalTo("ITEM_EXISTS"))
        member.request().body(mapOf("name" to "X", "id" to "../evil")).post(lists())
            .then().statusCode(400).body("code", equalTo("INVALID_ID"))
    }

    @Test
    fun `validation errors are 400`() {
        val listId = createList()
        member.request().body(mapOf("name" to " ")).post("${lists()}/$listId/items").then().statusCode(400).body("code", equalTo("INVALID_ITEM_NAME"))
        member.request().body(mapOf("name" to "")).post(lists()).then().statusCode(400).body("code", equalTo("INVALID_NAME"))
    }

    @Test
    fun `permissions - members can't delete lists, strangers see nothing`() {
        val listId = createList()
        val stranger = TestUsers.register()

        member.request().delete("${lists()}/$listId").then().statusCode(403).body("code", equalTo("OWNER_ONLY"))
        stranger.request().get(lists()).then().statusCode(404)
        stranger.request().get("${lists()}/$listId").then().statusCode(404)
        stranger.request().body(mapOf("name" to "Hack")).post("${lists()}/$listId/items").then().statusCode(404)

        owner.request().delete("${lists()}/$listId").then().statusCode(204)
        member.request().get("${lists()}/$listId").then().statusCode(404).body("code", equalTo("LIST_NOT_FOUND"))
    }

    @Test
    fun `an edit without any editable field is a 400`() {
        val listId = createList()
        val milk = addItem(listId, "Milk")
        member.request().body("""{"checked": true}""").patch("${lists()}/$listId/items/$milk")
            .then().statusCode(400).body("code", equalTo("INVALID_REQUEST"))
    }

    @Test
    fun `editing several fields at once applies all of them`() {
        val listId = createList()
        val milk = addItem(listId, "Milk")
        member.request().body(mapOf("name" to "Oat milk", "categoryId" to "dairy")).patch("${lists()}/$listId/items/$milk")
            .then().statusCode(200).body("items[0].name", equalTo("Oat milk")).body("items[0].categoryId", equalTo("dairy"))
        member.request().body("""{"categoryId": ""}""").patch("${lists()}/$listId/items/$milk")
            .then().statusCode(200).body("items[0].categoryId", nullValue())
    }

    @Test
    fun `sorting by an unknown layout is a 404, a blank sort means order of adding`() {
        val listId = createList()
        addItem(listId, "Milk")
        member.request().queryParam("sort", "no-such-layout").get("${lists()}/$listId")
            .then().statusCode(404).body("code", equalTo("LAYOUT_NOT_FOUND"))
        member.request().queryParam("sort", "").get("${lists()}/$listId")
            .then().statusCode(200).body("sortedBy", nullValue()).body("items.name", contains("Milk"))
    }

    @Test
    fun `list summaries count open and checked items`() {
        val listId = createList()
        val milk = addItem(listId, "Milk")
        addItem(listId, "Bread")
        member.request().post("${lists()}/$listId/items/$milk/check").then().statusCode(200)

        member.request().get(lists()).then().statusCode(200)
            .body("[0].openItems", equalTo(1)).body("[0].checkedItems", equalTo(1))
    }

    @Test
    fun `seq increases with every change`() {
        val listId = createList()
        val first: Int = member.request().body(mapOf("name" to "A")).post("${lists()}/$listId/items").then().extract().path("items[0].seq")
        val second: Int = member.request().body(mapOf("name" to "B")).post("${lists()}/$listId/items").then().extract().path("items[1].seq")
        assert(second > first)
    }

    private fun assertEqualsString(expected: String, actual: String) = kotlin.test.assertEquals(expected, actual)
}
