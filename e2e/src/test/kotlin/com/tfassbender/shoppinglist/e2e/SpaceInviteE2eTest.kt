package com.tfassbender.shoppinglist.e2e

import org.hamcrest.Matchers.containsInAnyOrder
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test

/** Two users: the owner creates a space and invites the second user via a single-use link. */
class SpaceInviteE2eTest {

    @BeforeEach
    fun setUp() = E2eSupport.requireRunningBackend()

    @Test
    fun `owner invites a second user who joins the space`() {
        val owner = E2eUsers.register("Owner")
        val guest = E2eUsers.register("Guest")

        val spaceId: String = owner.request().body(mapOf("name" to "Family")).post("/api/spaces")
            .then().statusCode(201).extract().path("id")
        val token: String = owner.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites")
            .then().statusCode(201).extract().path("token")

        guest.request().post("/api/invites/$token/accept").then().statusCode(200)
        guest.request().post("/api/invites/$token/accept").then().statusCode(404)

        owner.request().get("/api/spaces/$spaceId/members").then().statusCode(200)
            .body("displayName", containsInAnyOrder("Owner", "Guest"))
    }
}
