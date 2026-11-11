package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import java.util.Optional
import kotlin.test.assertTrue

/** The test profile configures one fingerprint (lowercase, see application.properties). */
@QuarkusTest
class AssetLinksResourceTest {

    @Test
    fun `asset links are public JSON with the configured package and fingerprint`() {
        given().`when`().get("/.well-known/assetlinks.json")
            .then()
            .statusCode(200)
            .contentType(startsWith("application/json"))
            .body("[0].relation", contains(AssetLinksResource.HANDLE_ALL_URLS))
            .body("[0].target.namespace", equalTo("android_app"))
            .body("[0].target.package_name", equalTo("com.tfassbender.shoppinglist"))
            .body("[0].target.sha256_cert_fingerprints[0]", startsWith("14:6D:E9:83"))
    }

    @Test
    fun `without fingerprints the list is empty`() {
        val resource = AssetLinksResource(Optional.of(listOf("com.tfassbender.shoppinglist")), Optional.empty())
        assertTrue(resource.assetLinks().isEmpty())
    }
}
