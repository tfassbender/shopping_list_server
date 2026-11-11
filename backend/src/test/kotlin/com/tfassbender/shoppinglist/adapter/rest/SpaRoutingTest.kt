package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.containsString
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

/**
 * Uses the stub `index.html` from `src/test/resources/META-INF/resources` (or the real SPA when built with
 * -PwithFrontend), so only checks for an HTML document.
 */
@QuarkusTest
class SpaRoutingTest {

    @Test
    fun `deep link is served with index html`() {
        given()
            .`when`().get("/spaces/123/lists/456")
            .then()
            .statusCode(200)
            .body(containsString("<!doctype html>"))
    }

    @Test
    fun `root is served with index html`() {
        given()
            .`when`().get("/")
            .then()
            .statusCode(200)
            .body(containsString("<!doctype html>"))
    }

    @Test
    fun `classifies paths`() {
        assertTrue(SpaRouting.isSpaRoute("/spaces"))
        assertTrue(SpaRouting.isSpaRoute("/invite/abc"))
        assertFalse(SpaRouting.isSpaRoute("/"))
        assertFalse(SpaRouting.isSpaRoute("/api/health"))
        assertFalse(SpaRouting.isSpaRoute("/q/openapi"))
        assertFalse(SpaRouting.isSpaRoute("/.well-known/assetlinks.json"))
        assertFalse(SpaRouting.isSpaRoute("/.well-known/"))
        assertFalse(SpaRouting.isSpaRoute("/assets/index-abc.js"))
    }
}
