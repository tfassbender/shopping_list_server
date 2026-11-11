package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import io.restassured.http.ContentType
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.notNullValue
import org.junit.jupiter.api.Test

/** REST contract of auth + account endpoints. Email is disabled in the test profile. */
@QuarkusTest
class AuthResourceTest {

    @Test
    fun `register returns a session and the user`() {
        given().contentType(ContentType.JSON)
            .body(mapOf("email" to "Reg-${System.nanoTime()}@Example.com", "displayName" to "Anna", "password" to "secret-password", "language" to "de"))
            .post("/api/auth/register")
            .then().statusCode(201)
            .body("token", notNullValue())
            .body("expiresAt", notNullValue())
            .body("verificationRequired", equalTo(false))
            .body("user.displayName", equalTo("Anna"))
            .body("user.emailVerified", equalTo(true))
            .body("user.settings.language", equalTo("de"))
            .body("user.settings.theme", equalTo("SYSTEM"))
    }

    @Test
    fun `duplicate email is a 409`() {
        val user = TestUsers.register()
        given().contentType(ContentType.JSON)
            .body(mapOf("email" to user.email.uppercase(), "displayName" to "Other", "password" to "secret-password"))
            .post("/api/auth/register")
            .then().statusCode(409).body("code", equalTo("EMAIL_TAKEN"))
    }

    @Test
    fun `invalid registration is a 400 with a code`() {
        given().contentType(ContentType.JSON)
            .body(mapOf("email" to "x@example.com", "displayName" to "Anna", "password" to "short"))
            .post("/api/auth/register")
            .then().statusCode(400).body("code", equalTo("PASSWORD_TOO_SHORT"))
    }

    @Test
    fun `login and me`() {
        val user = TestUsers.register("Bob")
        val token: String = given().contentType(ContentType.JSON)
            .body(mapOf("email" to user.email, "password" to user.password))
            .post("/api/auth/login")
            .then().statusCode(200).extract().path("token")

        given().auth().oauth2(token).get("/api/users/me")
            .then().statusCode(200)
            .body("id", equalTo(user.id))
            .body("displayName", equalTo("Bob"))
    }

    @Test
    fun `wrong password is a 401`() {
        val user = TestUsers.register()
        given().contentType(ContentType.JSON)
            .body(mapOf("email" to user.email, "password" to "wrong-password"))
            .post("/api/auth/login")
            .then().statusCode(401).body("code", equalTo("INVALID_CREDENTIALS"))
    }

    @Test
    fun `protected endpoints require a valid token`() {
        given().get("/api/users/me").then().statusCode(401)
        given().auth().oauth2("not-a-jwt").get("/api/users/me").then().statusCode(401)
    }

    @Test
    fun `settings and display name can be updated`() {
        val user = TestUsers.register()
        user.request()
            .body(mapOf("language" to "de", "theme" to "DARK", "checkedItemsToEnd" to false, "ignoreMergeWarnings" to true))
            .put("/api/users/me/settings")
            .then().statusCode(200)
            .body("settings.theme", equalTo("DARK"))
            .body("settings.checkedItemsToEnd", equalTo(false))

        user.request().body(mapOf("displayName" to "New Name")).put("/api/users/me/display-name")
            .then().statusCode(200).body("displayName", equalTo("New Name"))

        user.request().body(mapOf("language" to "xx", "theme" to "DARK", "checkedItemsToEnd" to false, "ignoreMergeWarnings" to true))
            .put("/api/users/me/settings")
            .then().statusCode(400).body("code", equalTo("INVALID_LANGUAGE"))
    }

    @Test
    fun `refresh issues a new working token`() {
        val user = TestUsers.register()
        val fresh: String = user.request().post("/api/auth/refresh").then().statusCode(200).extract().path("token")
        given().auth().oauth2(fresh).get("/api/users/me").then().statusCode(200)
    }

    @Test
    fun `changing the password invalidates the old token`() {
        val user = TestUsers.register()
        val newToken: String = user.request()
            .body(mapOf("currentPassword" to user.password, "newPassword" to "another-password"))
            .post("/api/users/me/change-password")
            .then().statusCode(200).extract().path("token")

        given().auth().oauth2(user.token).get("/api/users/me").then().statusCode(401)
        given().auth().oauth2(newToken).get("/api/users/me").then().statusCode(200)
    }

    @Test
    fun `logout everywhere invalidates the old token`() {
        val user = TestUsers.register()
        val newToken: String = user.request().post("/api/users/me/logout-everywhere").then().statusCode(200).extract().path("token")
        given().auth().oauth2(user.token).get("/api/users/me").then().statusCode(401)
        given().auth().oauth2(newToken).get("/api/users/me").then().statusCode(200)
    }

    @Test
    fun `email flows are 503 when email is disabled`() {
        given().contentType(ContentType.JSON).body(mapOf("email" to "a@example.com"))
            .post("/api/auth/forgot-password")
            .then().statusCode(503).body("code", equalTo("EMAIL_DISABLED"))
        given().get("/api/auth/config").then().statusCode(200).body("emailEnabled", equalTo(false))
    }
}
