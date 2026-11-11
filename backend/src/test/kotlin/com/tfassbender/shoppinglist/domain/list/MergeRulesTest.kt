package com.tfassbender.shoppinglist.domain.list

import com.tfassbender.shoppinglist.domain.list.ListChange.AddItem
import com.tfassbender.shoppinglist.domain.list.ListChange.CheckItem
import com.tfassbender.shoppinglist.domain.list.ListChange.DeleteItem
import com.tfassbender.shoppinglist.domain.list.ListChange.EditItem
import com.tfassbender.shoppinglist.domain.list.ListChange.RemoveChecked
import com.tfassbender.shoppinglist.domain.list.ListChange.RenameList
import com.tfassbender.shoppinglist.domain.list.ListChange.UncheckItem
import com.tfassbender.shoppinglist.domain.list.MergeWarning.DeleteSkipped
import com.tfassbender.shoppinglist.domain.list.MergeWarning.Overwritten
import com.tfassbender.shoppinglist.domain.list.MergeWarning.Restored
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test
import java.time.Duration
import java.time.Instant
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * The offline merge rules of `doc/features.md` 3.5, scenario by scenario. Typical setup: Anna works
 * online, Bob was offline since [BASE] (his client's last pull) and syncs his changes later. Anna's
 * changes after [BASE] are "concurrent" for Bob.
 */
class MergeRulesTest {

    private val t0 = Instant.parse("2026-01-01T10:00:00Z")
    private val anna = UserId("anna")
    private val bob = UserId("bob")
    private val carl = UserId("carl")
    private val milk = ItemId("milk")
    private val bread = ItemId("bread")
    private val eggs = ItemId("eggs")

    /** State everybody knows (all changes up to seq 3 = BASE): milk (1 l), bread, eggs. */
    private val known: ShoppingList = ShoppingList.create(ListId("l"), SpaceId("s"), "Groceries", 1, t0)
        .apply(AddItem(milk, "Milk", "1", "l"), ChangeContext(2, t0, anna)).list
        .apply(AddItem(bread, "Bread"), ChangeContext(3, t0, anna)).list
        .apply(AddItem(eggs, "Eggs"), ChangeContext(BASE, t0, carl)).list

    private var nextSeq = BASE + 1

    /** Anna's online change (applied now, after Bob's base). */
    private fun ShoppingList.byAnna(change: ListChange): ShoppingList = apply(change, ChangeContext(nextSeq++, t0, anna)).list

    /** One of Bob's offline changes, synced with base [BASE]. */
    private fun ShoppingList.byBob(change: ListChange, base: Long? = BASE): ApplyResult =
        apply(change, ChangeContext(nextSeq++, t0.plusSeconds(60), bob, base))

    /** Several offline changes of Bob in one batch (same seq), collecting all warnings. */
    private fun ShoppingList.byBobBatch(vararg changes: ListChange): ApplyResult {
        val context = ChangeContext(nextSeq++, t0.plusSeconds(60), bob, BASE)
        return changes.fold(ApplyResult(this)) { acc, change ->
            val next = acc.list.apply(change, context)
            ApplyResult(next.list, acc.warnings + next.warnings)
        }
    }

    @Nested
    inner class SameFieldLaterWins {
        @Test
        fun `Bob's later change overwrites Anna's concurrent change and warns`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBob(EditItem(milk, ItemField.QUANTITY, "2"))

            assertEquals("2", result.list.item(milk)!!.quantity)
            assertEquals(listOf(Overwritten(known.id, milk, "Milk", ItemAspect.QUANTITY, "3", "2", anna)), result.warnings)
        }

        @Test
        fun `different fields of the same item merge without warning`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBob(EditItem(milk, ItemField.UNIT, "ml"))

            assertEquals("3", result.list.item(milk)!!.quantity)
            assertEquals("ml", result.list.item(milk)!!.unit)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `different items merge without warning`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBob(EditItem(bread, ItemField.QUANTITY, "2"))
            assertEquals("3", result.list.item(milk)!!.quantity)
            assertEquals("2", result.list.item(bread)!!.quantity)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `a change Bob already knew (before his base) is not a conflict`() {
            val annaBeforeBase = known.apply(EditItem(milk, ItemField.QUANTITY, "3"), ChangeContext(BASE, t0, anna)).list
            val result = annaBeforeBase.byBob(EditItem(milk, ItemField.QUANTITY, "2"))
            assertEquals("2", result.list.item(milk)!!.quantity)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `same value on both sides is no conflict`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBob(EditItem(milk, ItemField.QUANTITY, " 3 "))
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `Bob overwriting his own earlier change is no conflict`() {
            val first = known.byBob(EditItem(milk, ItemField.QUANTITY, "5")).list
            val result = first.byBob(EditItem(milk, ItemField.QUANTITY, "6"))
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `online changes (no base) never warn`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBob(EditItem(milk, ItemField.QUANTITY, "2"), base = null)
            assertEquals("2", result.list.item(milk)!!.quantity)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `the warning names the latest concurrent author`() {
            val list = known.byAnna(EditItem(milk, ItemField.NOTE, "organic"))
                .apply(EditItem(milk, ItemField.NOTE, "lactose free"), ChangeContext(nextSeq++, t0, carl)).list
            val warning = list.byBob(EditItem(milk, ItemField.NOTE, "cheap")).warnings.single() as Overwritten
            assertEquals(carl, warning.by)
            assertEquals("lactose free", warning.theirValue)
        }

        @Test
        fun `clearing a value Anna had set concurrently is an overwrite`() {
            val result = known.byAnna(EditItem(milk, ItemField.NOTE, "organic")).byBob(EditItem(milk, ItemField.NOTE, null))
            assertNull(result.list.item(milk)!!.note)
            assertEquals(Overwritten(known.id, milk, "Milk", ItemAspect.NOTE, "organic", null, anna), result.warnings.single())
        }

        @Test
        fun `name and category conflicts are reported with raw values`() {
            val list = known.byAnna(EditItem(milk, ItemField.NAME, "Oat milk")).byAnna(EditItem(milk, ItemField.CATEGORY, "dairy"))
            val result = list.byBobBatch(EditItem(milk, ItemField.NAME, "Whole milk"), EditItem(milk, ItemField.CATEGORY, "drinks"))
            assertEquals(
                listOf(ItemAspect.NAME to ("Oat milk" to "Whole milk"), ItemAspect.CATEGORY to ("dairy" to "drinks")),
                result.warnings.map { (it as Overwritten).aspect to (it.theirValue to it.yourValue) },
            )
            assertEquals("Whole milk", result.list.item(milk)!!.name)
        }

        @Test
        fun `uncheck overwrites a concurrent check`() {
            val result = known.byAnna(CheckItem(milk)).byBob(UncheckItem(milk))
            assertFalse(result.list.item(milk)!!.checked)
            assertEquals(Overwritten(known.id, milk, "Milk", ItemAspect.CHECKED, "true", "false", anna), result.warnings.single())
        }

        @Test
        fun `both checking the same item is no conflict`() {
            val result = known.byAnna(CheckItem(milk)).byBob(CheckItem(milk))
            assertTrue(result.list.item(milk)!!.checked)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `renaming the list concurrently warns with no item id`() {
            val result = known.byAnna(RenameList("Weekend")).byBob(RenameList("Party"))
            assertEquals("Party", result.list.name)
            assertEquals(Overwritten(known.id, null, "Weekend", ItemAspect.NAME, "Weekend", "Party", anna), result.warnings.single())
        }

        @Test
        fun `renaming to the same name is no conflict`() {
            assertTrue(known.byAnna(RenameList("Weekend")).byBob(RenameList("Weekend")).warnings.isEmpty())
        }

        @Test
        fun `after Bob's overwrite, Carl's stale change conflicts with Bob`() {
            val afterBob = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3")).byBob(EditItem(milk, ItemField.QUANTITY, "2")).list
            val carlResult = afterBob.apply(EditItem(milk, ItemField.QUANTITY, "7"), ChangeContext(nextSeq++, t0, carl, BASE))
            assertEquals(Overwritten(known.id, milk, "Milk", ItemAspect.QUANTITY, "2", "7", bob), carlResult.warnings.single())
        }
    }

    @Nested
    inner class EditWinsOverDelete {
        @Test
        fun `editing an item Anna deleted restores it with Bob's change`() {
            val result = known.byAnna(DeleteItem(milk)).byBob(EditItem(milk, ItemField.QUANTITY, "2"))

            val item = result.list.item(milk)!!
            assertTrue(item.isActive)
            assertNull(item.deletedAt)
            assertEquals("2", item.quantity)
            assertEquals("l", item.unit) // other fields as before
            assertEquals(listOf(Restored(known.id, milk, "Milk", anna)), result.warnings)
        }

        @Test
        fun `unchecking an item removed by 'remove checked' brings it back unchecked`() {
            val result = known.byAnna(CheckItem(bread)).byAnna(RemoveChecked()).byBob(UncheckItem(bread))
            assertTrue(result.list.item(bread)!!.isActive)
            assertFalse(result.list.item(bread)!!.checked)
            assertEquals(Restored(known.id, bread, "Bread", anna), result.warnings.first())
        }

        @Test
        fun `checking a deleted item restores it checked`() {
            val result = known.byAnna(DeleteItem(eggs)).byBob(CheckItem(eggs))
            assertTrue(result.list.item(eggs)!!.isActive)
            assertTrue(result.list.item(eggs)!!.checked)
            assertEquals(Restored(known.id, eggs, "Eggs", anna), result.warnings.single())
        }

        @Test
        fun `restoring an item Bob deleted himself gives no warning`() {
            val result = known.byBobBatch(DeleteItem(milk), EditItem(milk, ItemField.NOTE, "oops, still needed"))
            assertTrue(result.list.item(milk)!!.isActive)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `online edit of a deleted item also restores it`() {
            val result = known.byAnna(DeleteItem(milk)).byBob(EditItem(milk, ItemField.QUANTITY, "2"), base = null)
            assertTrue(result.list.item(milk)!!.isActive)
        }

        @Test
        fun `restore and overwrite in one change produce both warnings`() {
            val list = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3")).byAnna(DeleteItem(milk))
            val result = list.byBob(EditItem(milk, ItemField.QUANTITY, "2"))
            assertEquals(
                listOf(Restored(known.id, milk, "Milk", anna), Overwritten(known.id, milk, "Milk", ItemAspect.QUANTITY, "3", "2", anna)),
                result.warnings,
            )
        }

        @Test
        fun `restored item gets a new seq so other clients learn about it`() {
            val deleted = known.byAnna(DeleteItem(milk))
            val result = deleted.byBob(EditItem(milk, ItemField.NOTE, "x"))
            assertTrue(result.list.item(milk)!!.seq > deleted.item(milk)!!.seq)
        }

        @Test
        fun `edit of an item that never existed is still an error`() {
            val error = runCatching { known.byBob(EditItem(ItemId("ghost"), ItemField.NOTE, "x")) }.exceptionOrNull()
            assertEquals("ITEM_NOT_FOUND", (error as com.tfassbender.shoppinglist.domain.DomainException).code)
        }
    }

    @Nested
    inner class DeleteLosesAgainstConcurrentEdit {
        @Test
        fun `Bob's delete is skipped when Anna changed the item concurrently`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3")).byBob(DeleteItem(milk))

            assertTrue(result.list.item(milk)!!.isActive)
            assertEquals("3", result.list.item(milk)!!.quantity)
            assertEquals(listOf(DeleteSkipped(known.id, milk, "Milk", anna)), result.warnings)
        }

        @Test
        fun `a concurrent check also counts as change`() {
            val result = known.byAnna(CheckItem(milk)).byBob(DeleteItem(milk))
            assertTrue(result.list.item(milk)!!.isActive)
            assertEquals(DeleteSkipped(known.id, milk, "Milk", anna), result.warnings.single())
        }

        @Test
        fun `changes Bob knew don't prevent his delete`() {
            val annaBeforeBase = known.apply(EditItem(milk, ItemField.QUANTITY, "3"), ChangeContext(BASE, t0, anna)).list
            val result = annaBeforeBase.byBob(DeleteItem(milk))
            assertFalse(result.list.item(milk)!!.isActive)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `Bob's own earlier changes don't prevent his delete`() {
            val result = known.byBobBatch(EditItem(milk, ItemField.QUANTITY, "9"), DeleteItem(milk))
            assertFalse(result.list.item(milk)!!.isActive)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `online deletes always apply`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3")).byBob(DeleteItem(milk), base = null)
            assertFalse(result.list.item(milk)!!.isActive)
        }

        @Test
        fun `deleting an already deleted item is a silent no-op`() {
            val deleted = known.byAnna(DeleteItem(milk))
            val result = deleted.byBob(DeleteItem(milk))
            assertEquals(deleted, result.list)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `the skipped delete keeps the deleted state of no one - tombstone stamps untouched`() {
            val result = known.byAnna(EditItem(milk, ItemField.NOTE, "x")).byBob(DeleteItem(milk))
            assertNull(result.list.item(milk)!!.deletedAt)
        }
    }

    @Nested
    inner class RemoveCheckedOffline {
        @Test
        fun `removes the items Bob saw checked, keeps the ones Anna changed`() {
            val bobSawChecked = known.byAnna(CheckItem(milk)).byAnna(CheckItem(bread))
            // Bob's base would include these checks in reality - simulate by a base after them:
            val base = nextSeq - 1
            val list = bobSawChecked.byAnna(EditItem(bread, ItemField.NOTE, "the dark one"))
            val result = list.apply(RemoveChecked(setOf(milk, bread)), ChangeContext(nextSeq++, t0, bob, base))

            assertFalse(result.list.item(milk)!!.isActive)
            assertTrue(result.list.item(bread)!!.isActive)
            assertEquals(listOf(DeleteSkipped(known.id, bread, "Bread", anna)), result.warnings)
        }

        @Test
        fun `an item Anna unchecked concurrently stays`() {
            val checked = known.byAnna(CheckItem(eggs))
            val base = nextSeq - 1
            val result = checked.byAnna(UncheckItem(eggs)).apply(RemoveChecked(setOf(eggs)), ChangeContext(nextSeq++, t0, bob, base))
            assertTrue(result.list.item(eggs)!!.isActive)
            assertFalse(result.list.item(eggs)!!.checked)
            assertEquals(DeleteSkipped(known.id, eggs, "Eggs", anna), result.warnings.single())
        }

        @Test
        fun `items already deleted or unknown are ignored`() {
            val result = known.byAnna(DeleteItem(milk)).byBob(RemoveChecked(setOf(milk, ItemId("never-existed"))))
            assertTrue(result.warnings.isEmpty())
            assertEquals(listOf(bread, eggs), result.list.activeItems.map { it.id })
        }

        @Test
        fun `without ids it removes what is checked right now (online)`() {
            val result = known.byAnna(CheckItem(bread)).byBob(RemoveChecked(), base = null)
            assertEquals(listOf(milk, eggs), result.list.activeItems.map { it.id })
        }

        @Test
        fun `Bob checks and removes offline while Anna adds a note - the item stays checked`() {
            val list = known.byAnna(EditItem(milk, ItemField.NOTE, "2 packs"))
            val result = list.byBobBatch(CheckItem(milk), RemoveChecked(setOf(milk)))
            val item = result.list.item(milk)!!
            assertTrue(item.isActive)
            assertTrue(item.checked)
            assertEquals("2 packs", item.note)
            assertEquals(listOf(DeleteSkipped(known.id, milk, "Milk", anna)), result.warnings)
        }

        @Test
        fun `Anna's 'remove checked' and Bob's edit - edit wins`() {
            val result = known.byAnna(CheckItem(milk)).byAnna(RemoveChecked()).byBob(EditItem(milk, ItemField.QUANTITY, "4"))
            assertTrue(result.list.item(milk)!!.isActive)
            assertEquals("4", result.list.item(milk)!!.quantity)
        }
    }

    @Nested
    inner class Combinations {
        @Test
        fun `Bob adds and edits a new item offline - no warnings`() {
            val result = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
                .byBobBatch(AddItem(ItemId("cheese"), "Cheese"), EditItem(ItemId("cheese"), ItemField.QUANTITY, "200"), CheckItem(ItemId("cheese")))
            assertEquals("200", result.list.item(ItemId("cheese"))!!.quantity)
            assertTrue(result.warnings.isEmpty())
        }

        @Test
        fun `Anna deletes online, Bob (offline before) edits, then Anna sees the item again`() {
            val afterSync = known.byAnna(DeleteItem(bread)).byBob(EditItem(bread, ItemField.QUANTITY, "2")).list
            assertEquals(listOf(milk, bread, eggs), afterSync.activeItems.map { it.id })
        }

        @Test
        fun `a long offline batch mixing all rules`() {
            val online = known
                .byAnna(EditItem(milk, ItemField.QUANTITY, "3")) // conflict with Bob's quantity
                .byAnna(DeleteItem(bread)) // Bob will edit bread -> restored
                .byAnna(EditItem(eggs, ItemField.NOTE, "free range")) // Bob will delete eggs -> skipped
            val result = online.byBobBatch(
                EditItem(milk, ItemField.QUANTITY, "2"),
                EditItem(bread, ItemField.NOTE, "wholegrain"),
                DeleteItem(eggs),
                AddItem(ItemId("apples"), "Apples"),
                RenameList("Weekend shopping"),
            )
            assertEquals(
                listOf(Overwritten::class, Restored::class, DeleteSkipped::class),
                result.warnings.map { it::class },
            )
            assertEquals(listOf("2", null, null, null), result.list.activeItems.map { it.quantity })
            assertEquals("Weekend shopping", result.list.name)
            assertEquals(4, result.list.activeItems.size)
        }

        @Test
        fun `applying the same offline batch to the same state is deterministic`() {
            val online = known.byAnna(EditItem(milk, ItemField.QUANTITY, "3"))
            val changes = listOf(EditItem(milk, ItemField.QUANTITY, "2"), DeleteItem(bread))
            val context = ChangeContext(100, t0, bob, BASE)
            val first = changes.fold(online) { list, change -> list.apply(change, context).list }
            val second = changes.fold(online) { list, change -> list.apply(change, context).list }
            assertEquals(first, second)
        }

        @Test
        fun `every change stamps who changed what`() {
            val result = known.byBob(EditItem(milk, ItemField.QUANTITY, "2")).list
            assertEquals(bob, result.item(milk)!!.stamps[ItemAspect.QUANTITY]!!.by)
            assertEquals(anna, result.item(milk)!!.stamps[ItemAspect.EXISTENCE]!!.by)
        }
    }

    @Nested
    inner class Tombstones {
        @Test
        fun `purge drops only tombstones older than the cutoff and reports their highest seq`() {
            val list = known
                .apply(DeleteItem(milk), ChangeContext(10, t0, anna)).list
                .apply(DeleteItem(bread), ChangeContext(11, t0.plus(Duration.ofDays(20)), anna)).list

            val (purged, purgedSeq) = list.purgeTombstones(t0.plus(Duration.ofDays(10)))

            assertNull(purged.item(milk))
            assertTrue(purged.item(bread)!!.deleted) // too young to purge
            assertTrue(purged.item(eggs)!!.isActive)
            assertEquals(10, purgedSeq)
        }

        @Test
        fun `nothing to purge reports 0`() {
            assertEquals(0, known.purgeTombstones(t0.plus(Duration.ofDays(100))).second)
        }
    }

    private companion object {
        const val BASE = 4L
    }
}
