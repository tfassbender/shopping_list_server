package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.equalTo
import org.junit.jupiter.api.Test

/** The app shell must be revalidated (new deployments reach users), hashed assets may be cached long. */
@QuarkusTest
class CachingHeadersTest {

    @Test
    fun `app shell, deep links and API are revalidated`() {
        given().get("/").then().statusCode(200).header("Cache-Control", equalTo("no-cache"))
        given().get("/lists/123").then().statusCode(200).header("Cache-Control", equalTo("no-cache"))
        given().get("/api/health").then().statusCode(200).header("Cache-Control", equalTo("no-cache"))
    }

    @Test
    fun `hashed assets are cached for a year`() {
        given().get("/assets/does-not-matter.js").then().header("Cache-Control", equalTo("public, max-age=31536000, immutable"))
    }
}
