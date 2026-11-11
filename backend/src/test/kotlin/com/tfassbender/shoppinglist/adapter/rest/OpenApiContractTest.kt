package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.path.json.JsonPath
import org.junit.jupiter.api.Test
import java.nio.file.Files
import java.nio.file.Path
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The OpenAPI spec is the contract for generated clients (Android: openapi-generator + kotlinx.serialization),
 * so created resources need their body schema, no-content operations no body, and optional parameters must
 * not be required.
 */
@QuarkusTest
class OpenApiContractTest {

    private val spec: JsonPath by lazy {
        val json = given().queryParam("format", "json").`when`().get("/q/openapi").then().statusCode(200).extract().asString()
        Files.writeString(Path.of("build/openapi.json"), json) // handy for inspecting the generated spec
        JsonPath(json)
    }

    private fun operation(path: String, method: String): Map<String, Any?> =
        assertNotNull(spec.getMap<String, Any?>("paths.'$path'.$method"), "$method $path")

    private fun responseSchemaRef(path: String, method: String, status: String): String? =
        spec.getString("paths.'$path'.$method.responses.'$status'.content.'application/json'.schema.'\$ref'")

    @Test
    fun `created resources document their 201 body`() {
        val created = mapOf(
            ("/api/auth/register" to "post") to "SessionResponse",
            ("/api/spaces" to "post") to "SpaceDto",
            ("/api/spaces/{spaceId}/lists" to "post") to "ListDto",
            ("/api/spaces/{spaceId}/lists/{listId}/items" to "post") to "ListDto",
            ("/api/spaces/{spaceId}/invites" to "post") to "CreatedInviteDto",
            ("/api/spaces/{spaceId}/catalog/categories" to "post") to "CatalogDto",
            ("/api/spaces/{spaceId}/layouts" to "post") to "LayoutDto",
            ("/api/users/me/api-tokens" to "post") to "CreatedApiTokenDto",
        )
        created.forEach { (operation, schema) ->
            val (path, method) = operation
            assertEquals("#/components/schemas/$schema", responseSchemaRef(path, method, "201"), "$method $path")
        }
        listOf("CreatedInviteDto", "CreatedApiTokenDto").forEach {
            assertNotNull(spec.getMap<String, Any?>("components.schemas.$it"), it)
        }
    }

    @Test
    fun `no-content operations document a 204 without body`() {
        val noContent = listOf(
            "/api/auth/forgot-password" to "post",
            "/api/auth/resend-verification" to "post",
            "/api/spaces/{spaceId}" to "delete",
            "/api/spaces/{spaceId}/leave" to "post",
            "/api/spaces/{spaceId}/members/{userId}" to "delete",
            "/api/spaces/{spaceId}/invites/{inviteId}" to "delete",
            "/api/spaces/{spaceId}/lists/{listId}" to "delete",
            "/api/spaces/{spaceId}/layouts/{layoutId}" to "delete",
            "/api/users/me" to "delete",
            "/api/users/me/api-tokens/{tokenId}" to "delete",
        )
        noContent.forEach { (path, method) ->
            @Suppress("UNCHECKED_CAST")
            val responses = operation(path, method)["responses"] as Map<String, Any?>
            assertTrue("204" in responses, "$method $path: ${responses.keys}")
            assertNull(spec.get<Any?>("paths.'$path'.$method.responses.'204'.content"), "$method $path")
        }
    }

    @Test
    fun `optional query parameters are not required`() {
        val optional = listOf(
            Triple("/api/spaces/{spaceId}/lists/{listId}", "get", "sort"),
            Triple("/api/spaces/{spaceId}/catalog/suggestions", "get", "q"),
            Triple("/api/spaces/{spaceId}/catalog/suggestions", "get", "limit"),
            Triple("/api/spaces/{spaceId}/catalog/history", "delete", "name"),
            Triple("/api/spaces/{spaceId}/changes", "get", "since"),
        )
        optional.forEach { (path, method, name) ->
            val required = spec.get<Boolean?>("paths.'$path'.$method.parameters.find { it.name == '$name' }.required")
            assertFalse(required == true, "$method $path ?$name")
        }
    }

    @Test
    fun `session token is nullable - it is sent as null while the email still needs verification`() {
        assertTrue("null" in spec.getList<String>("components.schemas.SessionResponse.properties.token.type"))
        assertTrue(spec.getString("components.schemas.SessionResponse.properties.expiresAt").contains("null"))
    }
}
