package com.tfassbender.shoppinglist.adapter.rest

import io.quarkus.test.junit.QuarkusTest
import io.restassured.RestAssured.given
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.containsInAnyOrder
import org.hamcrest.Matchers.equalTo
import org.hamcrest.Matchers.hasSize
import org.hamcrest.Matchers.startsWith
import org.junit.jupiter.api.Test

/** Spaces, invites and the owner/member/stranger permission matrix over REST. */
@QuarkusTest
class SpaceResourceTest {

    private fun createSpace(owner: TestUser, name: String = "Home"): String =
        owner.request().body(mapOf("name" to name)).post("/api/spaces")
            .then().statusCode(201).body("myRole", equalTo("OWNER")).extract().path("id")

    private fun invite(owner: TestUser, spaceId: String): String =
        owner.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites")
            .then().statusCode(201).extract().path("token")

    private fun join(user: TestUser, owner: TestUser, spaceId: String) {
        user.request().post("/api/invites/${invite(owner, spaceId)}/accept").then().statusCode(200)
    }

    @Test
    fun `create, list, rename and delete a space`() {
        val owner = TestUsers.register()
        val spaceId = createSpace(owner)

        owner.request().get("/api/spaces").then().statusCode(200)
            .body("", hasSize<Any>(1)).body("[0].name", equalTo("Home"))
        owner.request().body(mapOf("name" to "Family")).put("/api/spaces/$spaceId/name")
            .then().statusCode(200).body("name", equalTo("Family"))
        owner.request().delete("/api/spaces/$spaceId").then().statusCode(204)
        owner.request().get("/api/spaces/$spaceId").then().statusCode(404)
    }

    @Test
    fun `the user's own order of spaces is used for the space list`() {
        val owner = TestUsers.register()
        val home = createSpace(owner, "Home")
        val work = createSpace(owner, "Work")

        owner.request().body(mapOf("spaceIds" to listOf(work, home))).put("/api/spaces/order")
            .then().statusCode(200).body("name", contains("Work", "Home"))
        owner.request().get("/api/spaces").then().statusCode(200).body("name", contains("Work", "Home"))
    }

    @Test
    fun `invite link joins a member exactly once`() {
        val owner = TestUsers.register("Olga")
        val anna = TestUsers.register("Anna")
        val bob = TestUsers.register("Bob")
        val spaceId = createSpace(owner)

        val created = owner.request().body(mapOf("expiresInHours" to 48)).post("/api/spaces/$spaceId/invites")
            .then().statusCode(201)
            .body("url", startsWith("http://localhost:5173/invite/"))
            .extract()
        val token: String = created.path("token")

        anna.request().get("/api/invites/$token").then().statusCode(200)
            .body("spaceName", equalTo("Home")).body("invitedBy", equalTo("Olga")).body("alreadyMember", equalTo(false))
        anna.request().post("/api/invites/$token/accept").then().statusCode(200).body("myRole", equalTo("MEMBER"))
        bob.request().post("/api/invites/$token/accept").then().statusCode(404).body("code", equalTo("INVITE_INVALID"))

        anna.request().get("/api/spaces/$spaceId/members").then().statusCode(200)
            .body("displayName", containsInAnyOrder("Olga", "Anna"))
    }

    @Test
    fun `permission matrix - member vs owner vs stranger`() {
        val owner = TestUsers.register()
        val member = TestUsers.register()
        val stranger = TestUsers.register()
        val spaceId = createSpace(owner)
        join(member, owner, spaceId)

        // stranger: the space doesn't exist for them
        stranger.request().get("/api/spaces/$spaceId").then().statusCode(404).body("code", equalTo("SPACE_NOT_FOUND"))
        stranger.request().get("/api/spaces/$spaceId/members").then().statusCode(404)

        // member: may view, but not manage
        member.request().get("/api/spaces/$spaceId").then().statusCode(200).body("myRole", equalTo("MEMBER"))
        member.request().body(mapOf("name" to "X")).put("/api/spaces/$spaceId/name").then().statusCode(403).body("code", equalTo("OWNER_ONLY"))
        member.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites").then().statusCode(403)
        member.request().get("/api/spaces/$spaceId/invites").then().statusCode(403)
        member.request().delete("/api/spaces/$spaceId/members/${owner.id}").then().statusCode(403)
        member.request().body(mapOf("userId" to member.id)).post("/api/spaces/$spaceId/transfer-ownership").then().statusCode(403)
        member.request().delete("/api/spaces/$spaceId").then().statusCode(403)

        // owner: can't leave before handing over
        owner.request().post("/api/spaces/$spaceId/leave").then().statusCode(409).body("code", equalTo("OWNER_CANNOT_LEAVE"))
        owner.request().body(mapOf("userId" to member.id)).post("/api/spaces/$spaceId/transfer-ownership")
            .then().statusCode(200).body("myRole", equalTo("MEMBER"))
        owner.request().post("/api/spaces/$spaceId/leave").then().statusCode(204)
        member.request().get("/api/spaces/$spaceId/members").then().body("", hasSize<Any>(1))
    }

    @Test
    fun `owner removes a member and revokes invites`() {
        val owner = TestUsers.register()
        val member = TestUsers.register()
        val spaceId = createSpace(owner)
        join(member, owner, spaceId)

        owner.request().delete("/api/spaces/$spaceId/members/${member.id}").then().statusCode(204)
        member.request().get("/api/spaces/$spaceId").then().statusCode(404)

        val inviteId: String = owner.request().body(mapOf<String, Any>()).post("/api/spaces/$spaceId/invites")
            .then().extract().path("invite.id")
        owner.request().get("/api/spaces/$spaceId/invites").then().body("id", containsInAnyOrder(inviteId))
        owner.request().delete("/api/spaces/$spaceId/invites/$inviteId").then().statusCode(204)
        owner.request().get("/api/spaces/$spaceId/invites").then().body("", hasSize<Any>(0))
    }

    @Test
    fun `invalid invite expiry is a 400`() {
        val owner = TestUsers.register()
        val spaceId = createSpace(owner)
        owner.request().body(mapOf("expiresInHours" to 0)).post("/api/spaces/$spaceId/invites")
            .then().statusCode(400).body("code", equalTo("INVALID_EXPIRY"))
    }

    @Test
    fun `deleting the account hands the space over and invalidates the token`() {
        val owner = TestUsers.register()
        val member = TestUsers.register()
        val spaceId = createSpace(owner)
        join(member, owner, spaceId)

        owner.request().delete("/api/users/me").then().statusCode(204)

        given().auth().oauth2(owner.token).get("/api/users/me").then().statusCode(401)
        member.request().get("/api/spaces/$spaceId").then().statusCode(200).body("myRole", equalTo("OWNER"))
    }
}
