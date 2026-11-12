package com.tfassbender.shoppinglist.adapter.persistence

import com.tfassbender.shoppinglist.application.port.ApiTokenRepository
import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SpaceRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.ChangeContext
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.list.SyncState
import com.tfassbender.shoppinglist.domain.space.CatalogDefaults
import com.tfassbender.shoppinglist.domain.space.Invite
import com.tfassbender.shoppinglist.domain.space.InviteId
import com.tfassbender.shoppinglist.domain.space.Space
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.ApiToken
import com.tfassbender.shoppinglist.domain.user.ApiTokenId
import com.tfassbender.shoppinglist.domain.user.Email
import com.tfassbender.shoppinglist.domain.user.Language
import com.tfassbender.shoppinglist.domain.user.PendingToken
import com.tfassbender.shoppinglist.domain.user.ThemePreference
import com.tfassbender.shoppinglist.domain.user.TokenScope
import com.tfassbender.shoppinglist.domain.user.User
import com.tfassbender.shoppinglist.domain.user.UserApiTokens
import com.tfassbender.shoppinglist.domain.user.UserId
import com.tfassbender.shoppinglist.domain.user.UserSettings
import org.junit.jupiter.api.Test
import java.time.Instant
import java.util.UUID
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * Behaviour every storage adapter must have, run against the file storage ([FileRepositoryContractTest])
 * and PostgreSQL ([JpaRepositoryContractTest]). Covers round trips with all fields, the lookups, updates
 * that remove and reorder parts of an aggregate, and deleting a user or space with everything in it.
 *
 * The Postgres database is shared by all tests of a run, so every test uses its own random ids. Users and
 * spaces are saved first because the database references them (foreign keys).
 */
abstract class RepositoryContract {
    abstract val users: UserRepository
    abstract val apiTokens: ApiTokenRepository
    abstract val spaces: SpaceRepository
    abstract val catalogs: CatalogRepository
    abstract val lists: ShoppingListRepository
    abstract val layouts: LayoutRepository
    abstract val sequence: SequenceCounter
    abstract val syncStates: SyncStateRepository

    private val run = UUID.randomUUID().toString().take(8)
    private val t0 = Instant.parse("2026-01-01T10:00:00Z")

    private fun id(name: String) = "$name-$run"

    private fun user(name: String = "anna") = User(
        id = UserId(id(name)),
        email = Email.of("$name-$run@example.com"),
        displayName = name.replaceFirstChar { it.uppercase() },
        passwordHash = "hash",
        emailVerified = false,
        createdAt = t0,
        settings = UserSettings(Language.DE, ThemePreference.DARK, false, true),
        sessionVersion = 3,
        emailVerification = PendingToken("vhash-$name-$run", t0.plusSeconds(3600)),
        passwordReset = PendingToken("rhash-$name-$run", t0.plusSeconds(1800)),
    )

    private fun savedSpace(owner: UserId = UserId(id("owner"))): Space =
        Space.create(SpaceId(id("space")), "Home", owner, t0).also(spaces::save)

    // --- Users ----------------------------------------------------------------------------------------

    @Test
    fun `user round-trips with all fields and updates in place`() {
        val user = user()
        users.save(user)
        assertEquals(user, users.findById(user.id))

        val changed = user.copy(displayName = "Anna B.", emailVerified = true, emailVerification = null, passwordReset = null, sessionVersion = 4)
        users.save(changed)
        assertEquals(changed, users.findById(user.id))
    }

    @Test
    fun `users are found by email, token hashes and ids`() {
        val anna = user("anna").also(users::save)
        val bob = user("bob").copy(emailVerification = null, passwordReset = null).also(users::save)

        assertEquals(bob.id, users.findByEmail(Email.of("BOB-$run@example.com"))?.id)
        assertEquals(anna.id, users.findByVerificationTokenHash("vhash-anna-$run")?.id)
        assertEquals(anna.id, users.findByPasswordResetTokenHash("rhash-anna-$run")?.id)
        assertNull(users.findByEmail(Email.of("nobody-$run@example.com")))
        assertNull(users.findById(UserId(id("missing"))))
        assertEquals(setOf(anna.id, bob.id), users.findAllByIds(listOf(anna.id, bob.id, UserId(id("missing")))).map { it.id }.toSet())
    }

    @Test
    fun `api tokens round-trip, update and revoke`() {
        val user = user().also(users::save)
        assertEquals(UserApiTokens(user.id), apiTokens.find(user.id))

        val tokens = UserApiTokens(user.id)
            .add(ApiToken(ApiTokenId(id("t1")), "Claude", TokenScope.FULL, "hash1-$run", t0, null))
            .add(ApiToken(ApiTokenId(id("t2")), "Reader", TokenScope.READ, "hash2-$run", t0, t0.plusSeconds(60), t0))
            .add(ApiToken(ApiTokenId(id("t3")), "Script", TokenScope.READ, "hash3-$run", t0, null))
        apiTokens.save(tokens)
        assertEquals(tokens, apiTokens.find(user.id))

        val used = tokens.copy(tokens = tokens.tokens.filter { it.id.value != id("t2") }.map { it.copy(lastUsedAt = t0.plusSeconds(5)) })
        apiTokens.save(used)
        assertEquals(used, apiTokens.find(user.id))
    }

    @Test
    fun `deleting a user removes the api tokens`() {
        val user = user().also(users::save)
        apiTokens.save(UserApiTokens(user.id).add(ApiToken(ApiTokenId(id("t1")), "Claude", TokenScope.FULL, "hash-$run", t0, null)))

        users.delete(user.id)

        assertNull(users.findById(user.id))
        assertEquals(UserApiTokens(user.id), apiTokens.find(user.id))
    }

    // --- Spaces ---------------------------------------------------------------------------------------

    @Test
    fun `space round-trips with members and invites and is found by member and invite`() {
        val owner = UserId(id("owner"))
        val anna = UserId(id("anna"))
        val space = savedSpace(owner)
            .addInvite(Invite(InviteId(id("i1")), "hash1-$run", owner, t0, t0.plusSeconds(60)))
            .acceptInvite("hash1-$run", anna, t0)
            .addInvite(Invite(InviteId(id("i2")), "hash2-$run", owner, t0, t0.plusSeconds(60)))
        spaces.save(space)
        Space.create(SpaceId(id("other")), "Other", UserId(id("bob")), t0).also(spaces::save)

        assertEquals(space, spaces.findById(space.id))
        assertEquals(listOf(space.id), spaces.findByMember(anna).map { it.id })
        assertEquals(space.id, spaces.findByInviteTokenHash("hash2-$run")?.id)
        assertNull(spaces.findByInviteTokenHash("hash1-$run"))

        val withoutAnna = space.removeMember(anna).rename("Flat")
        spaces.save(withoutAnna)
        assertEquals(withoutAnna, spaces.findById(space.id))
        assertTrue(spaces.findByMember(anna).isEmpty())
    }

    @Test
    fun `catalog round-trips categories in order, units and history, and shrinks`() {
        val spaceId = savedSpace().id
        assertEquals(SpaceCatalog(spaceId), catalogs.find(spaceId))

        val defaults = CatalogDefaults.create(spaceId, Language.DE)
        val catalog = defaults
            .reorderCategories(defaults.categories.map { it.id }.reversed())
            .learn("Milch", CategoryId("dairy"), "l", t0)
            .countUsage("Brot", null, null, t0)
        catalogs.save(catalog)
        assertEquals(catalog, catalogs.find(spaceId))

        val smaller = catalog.stampHistoryChanges(catalog.removeHistory("Brot"), 5)
            .copy(categories = catalog.categories.drop(2), units = catalog.units.drop(1))
        catalogs.save(smaller)
        assertEquals(smaller, catalogs.find(spaceId))
    }

    @Test
    fun `lists round-trip with items, stamps and tombstones, and items can be removed and reordered`() {
        val spaceId = savedSpace().id
        val author = ChangeContext(3, t0, UserId(id("anna")), 1)
        val list = ShoppingList.create(ListId(id("l1")), spaceId, "Groceries", 1, t0)
            .apply(ListChange.AddItem(ItemId("milk"), "Milk", "2", "l", "low fat", CategoryId("dairy")), 2, t0)
            .apply(ListChange.AddItem(ItemId("bread"), "Bread"), author).list
            .apply(ListChange.CheckItem(ItemId("bread")), 4, t0)
            .apply(ListChange.AddItem(ItemId("gone"), "Gone"), 5, t0)
            .apply(ListChange.DeleteItem(ItemId("gone")), author).list
            .apply(ListChange.RenameList("Weekly"), author).list
        lists.save(list)
        assertEquals(list, lists.findById(spaceId, list.id))

        val changed = list.copy(items = list.items.filter { it.id.value != "gone" }.reversed())
            .apply(ListChange.EditItem(ItemId("milk"), com.tfassbender.shoppinglist.domain.list.ItemField.NOTE, null), 6, t0)
        lists.save(changed)
        assertEquals(changed, lists.findById(spaceId, list.id))
    }

    @Test
    fun `lists are found per space including deleted ones`() {
        val spaceId = savedSpace().id
        val other = Space.create(SpaceId(id("other")), "Other", UserId(id("bob")), t0).also(spaces::save).id
        lists.save(ShoppingList.create(ListId(id("l1")), spaceId, "Groceries", 1, t0))
        lists.save(ShoppingList.create(ListId(id("l2")), spaceId, "Hardware", 2, t0).markDeleted(3, t0))
        lists.save(ShoppingList.create(ListId(id("l3")), other, "Other", 1, t0))

        assertEquals(setOf(id("l1"), id("l2")), lists.findBySpace(spaceId).map { it.id.value }.toSet())
        assertNull(lists.findById(spaceId, ListId(id("l3"))))
        assertTrue(lists.findBySpace(SpaceId(id("empty"))).isEmpty())
    }

    @Test
    fun `layouts round-trip, change, are listed per space and deleted`() {
        val spaceId = savedSpace().id
        val layout = ShopLayout.create(LayoutId(id("aldi")), spaceId, "Aldi", LayoutMode.ITEMS, listOf(CategoryId("veg"), CategoryId("dairy")), t0)
            .withItemOrder(listOf("Bread", "Milk"))
            .connect(ListId("l1"))
            .connect(ListId("l2"))
        layouts.save(layout)
        layouts.save(layout.copy(id = LayoutId(id("rewe")), name = "Rewe"))
        assertEquals(layout, layouts.findById(spaceId, layout.id))
        assertEquals(setOf(id("aldi"), id("rewe")), layouts.findBySpace(spaceId).map { it.id.value }.toSet())

        val changed = layout.copy(categoryOrder = layout.categoryOrder.reversed(), itemOrder = listOf("Milk"), listIds = setOf(ListId("l2"), ListId("l3")))
        layouts.save(changed)
        assertEquals(changed, layouts.findById(spaceId, layout.id))

        layouts.delete(spaceId, layout.id)
        assertNull(layouts.findById(spaceId, layout.id))
    }

    @Test
    fun `sequence counter starts at zero and counts per space`() {
        val spaceId = savedSpace().id
        val other = Space.create(SpaceId(id("other")), "Other", UserId(id("bob")), t0).also(spaces::save).id

        assertEquals(0, sequence.current(spaceId))
        assertEquals(1, sequence.next(spaceId))
        assertEquals(2, sequence.next(spaceId))
        assertEquals(2, sequence.current(spaceId))
        assertEquals(0, sequence.current(other))
    }

    @Test
    fun `sync state round-trips and prunes`() {
        val spaceId = savedSpace().id
        assertEquals(SyncState(spaceId), syncStates.find(spaceId))

        val state = SyncState(spaceId, 7, mapOf("c1" to t0, "c2" to t0.plusSeconds(1)))
        syncStates.save(state)
        assertEquals(state, syncStates.find(spaceId))

        val pruned = state.copy(purgedSeq = 9, appliedChanges = mapOf("c2" to t0.plusSeconds(1), "c3" to t0.plusSeconds(2)))
        syncStates.save(pruned)
        assertEquals(pruned, syncStates.find(spaceId))
    }

    @Test
    fun `deleting a space removes its lists, layouts, catalog and sync data`() {
        val spaceId = savedSpace().id
        catalogs.save(CatalogDefaults.create(spaceId, Language.EN))
        lists.save(ShoppingList.create(ListId(id("l1")), spaceId, "Groceries", 1, t0).apply(ListChange.AddItem(ItemId("milk"), "Milk"), 2, t0))
        layouts.save(ShopLayout.create(LayoutId(id("aldi")), spaceId, "Aldi", LayoutMode.CATEGORIES, emptyList(), t0))
        sequence.next(spaceId)
        syncStates.save(SyncState(spaceId, 1, mapOf("c1" to t0)))

        spaces.delete(spaceId)

        assertNull(spaces.findById(spaceId))
        assertEquals(SpaceCatalog(spaceId), catalogs.find(spaceId))
        assertTrue(lists.findBySpace(spaceId).isEmpty())
        assertTrue(layouts.findBySpace(spaceId).isEmpty())
        assertEquals(0, sequence.current(spaceId))
        assertEquals(SyncState(spaceId), syncStates.find(spaceId))
    }
}
