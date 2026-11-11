package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/** The test profile configures one fingerprint for the release app only (lowercase, see application.properties). */
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
    fun `only apps with fingerprints are listed, each with its own`() {
        val release = AndroidApp("com.tfassbender.shoppinglist", listOf(" aa:bb "))
        val debug = AndroidApp("com.tfassbender.shoppinglist.debug", listOf("cc:dd"))

        val statements = AssetLinksResource.statementsFor(listOf(release, debug))
        assertEquals(
            listOf("com.tfassbender.shoppinglist" to listOf("AA:BB"), "com.tfassbender.shoppinglist.debug" to listOf("CC:DD")),
            statements.map { it.target.packageName to it.target.sha256CertFingerprints },
        )

        // the test profile configures only the release app, so the debug app is left out there
        assertEquals(1, AssetLinksResource.statementsFor(listOf(release, debug.copy(fingerprints = listOf(" ")))).size)
    }

    @Test
    fun `without fingerprints the list is empty`() {
        val apps = listOf(AndroidApp("com.tfassbender.shoppinglist", emptyList()), AndroidApp("", listOf("AA:BB")))
        assertTrue(AssetLinksResource.statementsFor(apps).isEmpty())
    }
}
