package com.tfassbender.shoppinglist.application.space

import com.tfassbender.shoppinglist.application.InMemoryCatalogRepository
import com.tfassbender.shoppinglist.application.InMemorySpaceRepository
import com.tfassbender.shoppinglist.application.InMemoryUserRepository
import com.tfassbender.shoppinglist.application.MutableClock
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.space.Role
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.time.Duration
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

class SpaceServiceTest {

    private val users = InMemoryUserRepository()
    private val spaces = InMemorySpaceRepository()
    private val clock = MutableClock()
    private val locks = SpaceLocks()
    private val notifier = RecordingNotifier()
    private val catalogs = InMemoryCatalogRepository()
    private val service = SpaceService(spaces, users, SpaceAccess(spaces), locks, clock, CatalogService(catalogs, com.tfassbender.shoppinglist.application.InMemorySequenceCounter(), SpaceAccess(spaces), locks, clock), notifier)

    private val owner = user("owner", "Olga")
    private val anna = user("anna", "Anna")
    private val bob = user("bob", "Bob")

    private fun user(id: String, name: String): UserId {
        users.save(User(UserId(id), Email.of("$id@example.com"), name, "h", true, clock.instant()))
        return UserId(id)
    }

    private fun join(spaceId: com.tfassbender.shoppinglist.domain.space.SpaceId, user: UserId) {
        service.acceptInvite(user, service.createInvite(owner, spaceId).rawToken)
    }

    @Test
    fun `create and list my spaces sorted by name`() {
        service.create(owner, "Work")
        service.create(owner, "home")
        service.create(anna, "Anna's")

        assertEquals(listOf("home", "Work"), service.listMine(owner).map { it.name })
    }

    @Test
    fun `a new space gets default categories and units in the creator's language`() {
        users.save(users.findById(owner)!!.copy(settings = com.tfassbender.shoppinglist.domain.user.UserSettings(language = com.tfassbender.shoppinglist.domain.user.Language.DE)))
        val space = service.create(owner, "Zuhause")
        val catalog = catalogs.find(space.id)
        assertTrue(catalog.categories.any { it.name == "Obst & Gemüse" })
        assertTrue("Stk" in catalog.units)

        val english = service.create(anna, "Home")
        assertTrue(catalogs.find(english.id).categories.any { it.name == "Fruit & vegetables" })
    }

    @Test
    fun `non-members get not found, members get forbidden for owner actions`() {
        val space = service.create(owner, "Home")
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.get(anna, space.id) }.code)

        join(space.id, anna)
        service.get(anna, space.id)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.rename(anna, space.id, "X") }.code)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.delete(anna, space.id) }.code)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.createInvite(anna, space.id) }.code)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.removeMember(anna, space.id, owner) }.code)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.transferOwnership(anna, space.id, anna) }.code)
        assertEquals("OWNER_ONLY", assertThrows<DomainException> { service.listInvites(anna, space.id) }.code)
    }

    @Test
    fun `invite flow - preview, accept, single use`() {
        val space = service.create(owner, "Home")
        val created = service.createInvite(owner, space.id)
        assertEquals(clock.instant().plus(Duration.ofDays(1)), created.invite.expiresAt)

        val preview = service.previewInvite(anna, created.rawToken)
        assertEquals("Home", preview.spaceName)
        assertEquals("Olga", preview.invitedBy)
        assertFalse(preview.alreadyMember)

        service.acceptInvite(anna, created.rawToken)
        assertTrue(spaces.findById(space.id)!!.isMember(anna))
        assertEquals("INVITE_INVALID", assertThrows<DomainException> { service.acceptInvite(bob, created.rawToken) }.code)
        assertEquals("INVITE_INVALID", assertThrows<DomainException> { service.previewInvite(bob, created.rawToken) }.code)
    }

    @Test
    fun `invites expire, can be revoked and validity is bounded`() {
        val space = service.create(owner, "Home")
        val shortLived = service.createInvite(owner, space.id, Duration.ofHours(1))
        val revoked = service.createInvite(owner, space.id)
        assertEquals(2, service.listInvites(owner, space.id).size)

        service.revokeInvite(owner, space.id, revoked.invite.id)
        assertThrows<DomainException> { service.acceptInvite(anna, revoked.rawToken) }

        clock.advance(Duration.ofMinutes(61))
        assertTrue(service.listInvites(owner, space.id).isEmpty())
        assertThrows<DomainException> { service.acceptInvite(anna, shortLived.rawToken) }

        assertEquals("INVALID_EXPIRY", assertThrows<DomainException> { service.createInvite(owner, space.id, Duration.ofMinutes(59)) }.code)
        assertEquals("INVALID_EXPIRY", assertThrows<DomainException> { service.createInvite(owner, space.id, Duration.ofDays(31)) }.code)
    }

    @Test
    fun `owner renames and deletes the space`() {
        val space = service.create(owner, "Home")

        assertEquals("Holiday home", service.rename(owner, space.id, "  Holiday home ").name)
        assertEquals("Holiday home", spaces.findById(space.id)!!.name)
        assertEquals("INVALID_NAME", assertThrows<DomainException> { service.rename(owner, space.id, " ") }.code)

        service.delete(owner, space.id)
        assertNull(spaces.findById(space.id))
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.get(owner, space.id) }.code)
    }

    @Test
    fun `preview tells members they already belong and survives a deleted inviter`() {
        val space = service.create(owner, "Home")
        join(space.id, anna)
        val created = service.createInvite(owner, space.id)

        assertTrue(service.previewInvite(anna, created.rawToken).alreadyMember)
        users.delete(owner)
        assertEquals("?", service.previewInvite(bob, created.rawToken).invitedBy)
    }

    @Test
    fun `an expired invite can't be previewed or accepted`() {
        val space = service.create(owner, "Home")
        val created = service.createInvite(owner, space.id, Duration.ofHours(1))
        clock.advance(Duration.ofHours(1).plusSeconds(1))

        assertEquals("INVITE_INVALID", assertThrows<DomainException> { service.previewInvite(anna, created.rawToken) }.code)
        assertEquals("INVITE_INVALID", assertThrows<DomainException> { service.acceptInvite(anna, created.rawToken) }.code)
        assertEquals("INVITE_INVALID", assertThrows<DomainException> { service.acceptInvite(anna, "never-issued") }.code)
    }

    @Test
    fun `creating an invite drops expired ones from the space`() {
        val space = service.create(owner, "Home")
        service.createInvite(owner, space.id, Duration.ofHours(1))
        clock.advance(Duration.ofHours(2))

        val fresh = service.createInvite(owner, space.id)

        assertEquals(listOf(fresh.invite.id), spaces.findById(space.id)!!.invites.map { it.id })
    }

    @Test
    fun `members whose account is gone are shown with a placeholder name`() {
        val space = service.create(owner, "Home")
        join(space.id, anna)
        users.delete(anna)

        assertEquals(listOf("Olga", "?"), service.members(owner, space.id).map { it.displayName })
    }

    @Test
    fun `ownership can only go to members, and only members can be removed`() {
        val space = service.create(owner, "Home")
        assertEquals("MEMBER_NOT_FOUND", assertThrows<DomainException> { service.transferOwnership(owner, space.id, bob) }.code)
        assertEquals("MEMBER_NOT_FOUND", assertThrows<DomainException> { service.removeMember(owner, space.id, bob) }.code)
        assertEquals("SPACE_NOT_FOUND", assertThrows<DomainException> { service.leave(bob, space.id) }.code)
    }

    @Test
    fun `members list resolves display names, owner first`() {
        val space = service.create(owner, "Home")
        join(space.id, anna)
        val members = service.members(anna, space.id)
        assertEquals(listOf("Olga" to Role.OWNER, "Anna" to Role.MEMBER), members.map { it.displayName to it.member.role })
    }

    @Test
    fun `leave, remove and transfer ownership`() {
        val space = service.create(owner, "Home")
        join(space.id, anna)
        join(space.id, bob)

        assertEquals("OWNER_CANNOT_LEAVE", assertThrows<DomainException> { service.leave(owner, space.id) }.code)
        service.removeMember(owner, space.id, bob)
        service.transferOwnership(owner, space.id, anna)
        service.leave(owner, space.id)

        val result = spaces.findById(space.id)!!
        assertEquals(listOf(anna), result.members.map { it.userId })
        assertEquals(anna, result.owner.userId)
    }

    @Test
    fun `account deletion hands over owned spaces, deletes lonely ones and leaves others`() {
        val shared = service.create(owner, "Shared")
        join(shared.id, anna)
        join(shared.id, bob)
        val lonely = service.create(owner, "Lonely")
        val foreign = service.create(anna, "Anna's")
        service.acceptInvite(owner, service.createInvite(anna, foreign.id).rawToken)

        AccountDeletionService(users, spaces, locks).deleteAccount(owner)

        assertEquals(anna, spaces.findById(shared.id)!!.owner.userId)
        assertNull(spaces.findById(lonely.id))
        assertFalse(spaces.findById(foreign.id)!!.isMember(owner))
        assertNull(users.findById(owner))
    }

    @Test
    fun `users who lose access are notified - removed, left or space deleted`() {
        val space = service.create(owner, "Home")
        join(space.id, anna)
        join(space.id, bob)

        service.removeMember(owner, space.id, bob)
        service.leave(anna, space.id)
        assertEquals(listOf(listOf(bob), listOf(anna)), notifier.accessLost.map { it.second })

        join(space.id, anna)
        notifier.accessLost.clear()
        service.delete(owner, space.id)
        assertEquals(setOf(owner, anna), notifier.accessLost.single().second.toSet())
    }

    /** Records who was told about lost access. */
    class RecordingNotifier : com.tfassbender.shoppinglist.application.port.SpaceChangeNotifier {
        val accessLost = mutableListOf<Pair<com.tfassbender.shoppinglist.domain.space.SpaceId, List<UserId>>>()
        override fun spaceChanged(spaceId: com.tfassbender.shoppinglist.domain.space.SpaceId) {}
        override fun accessLost(spaceId: com.tfassbender.shoppinglist.domain.space.SpaceId, userIds: Collection<UserId>) {
            accessLost += spaceId to userIds.toList()
        }
    }
}
