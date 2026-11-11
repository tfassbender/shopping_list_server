package com.tfassbender.shoppinglist.domain.space

import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertSame
import kotlin.test.assertTrue

class SpaceTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val owner = UserId("owner")
    private val anna = UserId("anna")
    private val bob = UserId("bob")
    private val invite = Invite(InviteId("i1"), "hash1", owner, t0, t0.plusSeconds(3600))

    private fun space() = Space.create(SpaceId("s"), " Home ", owner, t0)

    private fun spaceWith(vararg ids: String): Space = ids.map(::UserId).foldIndexed(space()) { index, space, user ->
        val inv = Invite(InviteId("x$index"), "h$index", owner, t0, t0.plusSeconds(3600))
        space.addInvite(inv).acceptInvite("h$index", user, t0.plusSeconds(index + 1L))
    }

    @Test
    fun `create trims the name and makes the creator owner`() {
        val space = space()
        assertEquals("Home", space.name)
        assertEquals(owner, space.owner.userId)
        assertTrue(space.isOwner(owner))
    }

    @Test
    fun `name must not be blank or too long`() {
        assertEquals("INVALID_NAME", assertThrows<DomainException> { Space.create(SpaceId("s"), "  ", owner, t0) }.code)
        assertThrows<DomainException> { space().rename("x".repeat(61)) }
        assertEquals("Shop", space().rename(" Shop").name)
    }

    @Test
    fun `invite is single use`() {
        val joined = space().addInvite(invite).acceptInvite("hash1", anna, t0)

        assertEquals(Role.MEMBER, joined.memberOrNull(anna)?.role)
        assertTrue(joined.invites.isEmpty())
        assertEquals("INVITE_INVALID", assertThrows<DomainException> { joined.acceptInvite("hash1", bob, t0) }.code)
    }

    @Test
    fun `expired invite can't be used`() {
        val space = space().addInvite(invite)
        space.acceptInvite("hash1", anna, invite.expiresAt) // still valid at the exact expiry moment
        assertThrows<DomainException> { space.acceptInvite("hash1", anna, invite.expiresAt.plusSeconds(1)) }
        assertTrue(space.withoutExpiredInvites(invite.expiresAt.plusSeconds(1)).invites.isEmpty())
    }

    @Test
    fun `existing member can't consume an invite`() {
        val space = space().addInvite(invite)
        assertEquals("ALREADY_MEMBER", assertThrows<DomainException> { space.acceptInvite("hash1", owner, t0) }.code)
    }

    @Test
    fun `revoke removes the invite`() {
        val space = space().addInvite(invite).revokeInvite(invite.id)
        assertTrue(space.invites.isEmpty())
        assertEquals("INVITE_NOT_FOUND", assertThrows<DomainException> { space.revokeInvite(invite.id) }.code)
    }

    @Test
    fun `owner can't leave or be removed, members can`() {
        val space = spaceWith("anna")
        assertEquals("OWNER_CANNOT_LEAVE", assertThrows<DomainException> { space.removeMember(owner) }.code)
        assertEquals(listOf(owner), space.removeMember(anna).members.map { it.userId })
        assertEquals("MEMBER_NOT_FOUND", assertThrows<DomainException> { space.removeMember(bob) }.code)
    }

    @Test
    fun `ownership transfer keeps exactly one owner`() {
        val space = spaceWith("anna", "bob").transferOwnership(anna)
        assertEquals(anna, space.owner.userId)
        assertEquals(Role.MEMBER, space.memberOrNull(owner)?.role)
        assertEquals(1, space.members.count { it.role == Role.OWNER })
        assertThrows<DomainException> { space.transferOwnership(UserId("stranger")) }
        // after the handover the old owner can leave
        assertEquals(2, space.removeMember(owner).members.size)
    }

    @Test
    fun `deleted owner hands over to the longest-standing member`() {
        val space = spaceWith("anna", "bob") // anna joined before bob
        val remaining = space.removeDeletedUser(owner)!!
        assertEquals(anna, remaining.owner.userId)
        assertEquals(setOf(anna, bob), remaining.members.map { it.userId }.toSet())
    }

    @Test
    fun `deleted owner without members deletes the space, deleted member just leaves`() {
        assertNull(space().removeDeletedUser(owner))
        assertEquals(listOf(owner), spaceWith("anna").removeDeletedUser(anna)!!.members.map { it.userId })
        val space = space()
        assertSame(space, space.removeDeletedUser(bob))
    }

    @Test
    fun `invariant - exactly one owner`() {
        assertThrows<IllegalArgumentException> {
            Space(SpaceId("s"), "x", listOf(Member(owner, Role.MEMBER, t0)), emptyList(), t0)
        }
    }
}
