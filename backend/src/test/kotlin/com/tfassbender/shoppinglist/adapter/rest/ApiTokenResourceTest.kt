package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import io.restassured.specification.RequestSpecification
import org.hamcrest.Matchers.hasItem
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.notNullValue
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** API tokens over REST: the auth mechanism (JWT vs. token), read-only enforcement and revocation. */
@QuarkusTest
class ApiTokenResourceTest {

    private lateinit var user: TestUser
    private lateinit var spaceId: String

    @BeforeEach
    fun setUp() {
        user = TestUsers.register()
        spaceId = user.request().body(mapOf("name" to "Home")).post("/api/spaces").then().extract().path("id")
    }

    private fun createToken(scope: String): Pair<String, String> {
        val response = user.request().body(mapOf("name" to "Agent $scope", "scope" to scope, "expiresInDays" to 30))
            .post("/api/users/me/api-tokens")
            .then().statusCode(201)
            .body("rawToken", startsWith("slt_${user.id}_"))
            .body("token.expiresAt", notNullValue())
            .extract()
        return response.path<String>("token.id") to response.path("rawToken")
    }

    private fun withToken(token: String): RequestSpecification = given().contentType(ContentType.JSON).auth().oauth2(token)

    @Test
    fun `full token acts as the user`() {
        val (_, token) = createToken("FULL")
        withToken(token).get("/api/users/me").then().statusCode(200).body("id", equalTo(user.id))
        withToken(token).body(mapOf("name" to "Agent list")).post("/api/spaces/$spaceId/lists").then().statusCode(201)
        withToken(token).get("/api/spaces").then().statusCode(200).body("", hasSize<Any>(1))
    }

    @Test
    fun `read-only token can read but not change anything`() {
        val (_, token) = createToken("READ")
        withToken(token).get("/api/spaces/$spaceId/lists").then().statusCode(200)
        withToken(token).body(mapOf("name" to "Nope")).post("/api/spaces/$spaceId/lists")
            .then().statusCode(403).body("code", equalTo("READ_ONLY_TOKEN"))
        withToken(token).delete("/api/spaces/$spaceId").then().statusCode(403)
        withToken(token).body(mapOf("language" to "de", "theme" to "DARK", "checkedItemsToEnd" to true, "ignoreMergeWarnings" to false))
            .put("/api/users/me/settings").then().statusCode(403)
    }

    @Test
    fun `tokens can't manage tokens or the account`() {
        val (_, token) = createToken("FULL")
        withToken(token).get("/api/users/me/api-tokens").then().statusCode(403)
        withToken(token).body(mapOf("name" to "x", "scope" to "FULL")).post("/api/users/me/api-tokens").then().statusCode(403)
        withToken(token).delete("/api/users/me").then().statusCode(403)
        withToken(token).body(mapOf("currentPassword" to TestUsers.PASSWORD, "newPassword" to "hacked-password"))
            .post("/api/users/me/change-password").then().statusCode(403)
        withToken(token).post("/api/auth/refresh").then().statusCode(403)
    }

    @Test
    fun `revoked and unknown tokens are rejected, JWT still works`() {
        val (tokenId, token) = createToken("FULL")
        user.request().get("/api/users/me/api-tokens").then().statusCode(200).body("name", hasItem("Agent FULL"))

        user.request().delete("/api/users/me/api-tokens/$tokenId").then().statusCode(204)

        withToken(token).get("/api/users/me").then().statusCode(401)
        withToken("slt_${user.id}_made-up").get("/api/users/me").then().statusCode(401)
        user.request().get("/api/users/me").then().statusCode(200)
    }

    @Test
    fun `the OpenAPI spec documents bearer auth`() {
        given().get("/q/openapi?format=json").then().statusCode(200)
            .body("components.securitySchemes.bearerAuth.scheme", equalTo("bearer"))
    }
}
