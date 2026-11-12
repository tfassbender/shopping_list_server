package com.tfassbender.shoppinglist.application.list

import com.tfassbender.shoppinglist.application.port.CatalogRepository
import com.tfassbender.shoppinglist.application.port.LayoutRepository
import com.tfassbender.shoppinglist.application.port.SequenceCounter
import com.tfassbender.shoppinglist.application.port.ShoppingListRepository
import com.tfassbender.shoppinglist.application.port.SyncStateRepository
import com.tfassbender.shoppinglist.application.port.UserRepository
import com.tfassbender.shoppinglist.application.space.CatalogService
import com.tfassbender.shoppinglist.application.space.SpaceAccess
import com.tfassbender.shoppinglist.application.space.SpaceLocks
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.ErrorKind
import com.tfassbender.shoppinglist.domain.list.ChangeContext
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.MergeWarning
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.HistoryEntry
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import com.tfassbender.shoppinglist.domain.user.UserId
import jakarta.enterprise.context.ApplicationScoped
import java.time.Clock
import java.time.Duration

/** One change of an offline batch; [changeId] (client-generated) makes resending idempotent. */
sealed interface SyncOperation {
    val changeId: String
    val listId: ListId

    data class CreateList(override val changeId: String, override val listId: ListId, val name: String) : SyncOperation
    data class ChangeList(override val changeId: String, override val listId: ListId, val change: ListChange) : SyncOperation
}

enum class ChangeStatus {
    /** Applied now (possibly with warnings, or without effect, e.g. a skipped delete). */
    APPLIED,

    /** Already applied by an earlier (resent) batch – nothing done. */
    DUPLICATE,

    /** Not applicable (e.g. list deleted, invalid input) – the client drops it. */
    REJECTED,
}

data class ChangeResult(val changeId: String, val status: ChangeStatus, val code: String? = null)

/** A merge warning with the display names resolved for the client. */
data class WarningView(val warning: MergeWarning, val listName: String?, val byName: String?)

data class PushResult(val seq: Long, val results: List<ChangeResult>, val warnings: List<WarningView>)

data class PullResult(
    val seq: Long,
    val fullResync: Boolean,
    /** Changed lists with only their changed items (incl. tombstones); on full resync everything active. */
    val lists: List<ShoppingList>,
    val listIds: List<ListId>,
    /** The complete catalog (incl. history) if categories/units changed or history entries were removed. */
    val catalog: SpaceCatalog?,
    /** History entries added/updated since `since`; empty if [catalog] is sent (it contains them). */
    val historyChanges: List<HistoryEntry>,
    val layouts: List<ShopLayout>?,
    val layoutIds: List<String>,
)

/**
 * Offline sync of a space: [push] applies a batch of changes made offline, [pull] returns everything that
 * changed since a sequence number. The merge rules themselves live in the [ShoppingList] aggregate.
 */
@ApplicationScoped
class SyncService(
    private val lists: ShoppingListRepository,
    private val store: ListStore,
    private val syncStates: SyncStateRepository,
    private val sequence: SequenceCounter,
    private val catalogs: CatalogRepository,
    private val layouts: LayoutRepository,
    private val users: UserRepository,
    private val catalog: CatalogService,
    private val access: SpaceAccess,
    private val locks: SpaceLocks,
    private val clock: Clock,
) {

    /**
     * Applies the batch in order with one new sequence number. Each change is applied or rejected on its
     * own, so one stale change doesn't block the client's queue. [baseSeq]: the client's last pulled seq.
     */
    fun push(userId: UserId, spaceId: SpaceId, baseSeq: Long?, operations: List<SyncOperation>): PushResult {
        if (operations.size > MAX_BATCH) {
            throw DomainException(ErrorKind.VALIDATION, "BATCH_TOO_LARGE", "At most $MAX_BATCH changes per batch")
        }
        // A batch that only repeats applied changes (a resend) changes nothing: no new seq, no notification.
        val alreadyApplied = locks.read(spaceId) {
            access.requireMember(spaceId, userId)
            val state = syncStates.find(spaceId)
            operations.all { state.isApplied(it.changeId) }.takeIf { it }?.let { sequence.current(spaceId) }
        }
        if (alreadyApplied != null) {
            return PushResult(alreadyApplied, operations.map { ChangeResult(it.changeId, ChangeStatus.DUPLICATE) }, emptyList())
        }
        return locks.withLock(spaceId) {
            access.requireMember(spaceId, userId)
            val now = clock.instant()
            val context = ChangeContext(sequence.next(spaceId), now, userId, baseSeq)
            val batch = Batch(spaceId, context)
            var state = syncStates.find(spaceId).prune(now.minus(REMEMBER_CHANGES))
            for (operation in operations) {
                if (state.isApplied(operation.changeId)) {
                    batch.results += ChangeResult(operation.changeId, ChangeStatus.DUPLICATE)
                    continue
                }
                batch.apply(operation)
                state = state.remember(operation.changeId, now)
            }
            // The applied change ids are saved last: if saving a list fails (file storage has no rollback),
            // the client's resend must be applied again, not answered with DUPLICATE.
            val purgedSeq = batch.saveTouchedLists()
            syncStates.save(state.withPurged(purgedSeq))
            PushResult(context.seq, batch.results, batch.warningViews())
        }
    }

    fun pull(userId: UserId, spaceId: SpaceId, since: Long): PullResult = locks.read(spaceId) {
        access.requireMember(spaceId, userId)
        val current = sequence.current(spaceId)
        val full = syncStates.find(spaceId).needsFullResync(since, current)
        val all = lists.findBySpace(spaceId)
        val changed = if (full) {
            all.filterNot { it.deleted }.map { it.copy(items = it.activeItems) }
        } else {
            all.filter { list -> list.seq > since || list.items.any { it.seq > since } }
                .map { list -> list.copy(items = list.items.filter { it.seq > since }) }
        }
        val spaceCatalog = catalogs.find(spaceId)
        val catalogChanged = full || spaceCatalog.seq > since
        val spaceLayouts = layouts.findBySpace(spaceId)
        PullResult(
            seq = current,
            fullResync = full,
            lists = changed,
            listIds = all.filterNot { it.deleted }.map { it.id },
            catalog = spaceCatalog.takeIf { catalogChanged },
            historyChanges = if (catalogChanged) emptyList() else spaceCatalog.historyChangedSince(since),
            layouts = spaceLayouts.takeIf { layoutList -> full || layoutList.any { it.seq > since } },
            layoutIds = spaceLayouts.map { it.id.value },
        )
    }

    /** The lists touched by one batch, kept in memory until the batch is done. */
    private inner class Batch(private val spaceId: SpaceId, private val context: ChangeContext) {
        val results = mutableListOf<ChangeResult>()
        val warnings = mutableListOf<MergeWarning>()
        private val touched = linkedMapOf<ListId, ShoppingList>()
        private val appliedChanges = linkedMapOf<ListId, MutableList<ListChange>>()

        fun apply(operation: SyncOperation) {
            try {
                when (operation) {
                    is SyncOperation.CreateList -> createList(operation)
                    is SyncOperation.ChangeList -> changeList(operation)
                }
                results += ChangeResult(operation.changeId, ChangeStatus.APPLIED)
            } catch (e: DomainException) {
                results += ChangeResult(operation.changeId, ChangeStatus.REJECTED, e.code)
            }
        }

        private fun createList(operation: SyncOperation.CreateList) {
            if (find(operation.listId) != null) {
                throw DomainException(ErrorKind.CONFLICT, "LIST_EXISTS", "List ${operation.listId.value} already exists")
            }
            touched[operation.listId] = ShoppingList.create(operation.listId, spaceId, operation.name, context.seq, context.now)
        }

        private fun changeList(operation: SyncOperation.ChangeList) {
            val list = find(operation.listId) ?: throw ShoppingList.listNotFound()
            if (list.deleted) {
                warnings += MergeWarning.ListGone(list.id, list.name)
                throw ShoppingList.listNotFound()
            }
            val change = catalog.enrich(spaceId, listOf(operation.change)).single()
            val result = list.apply(change, context)
            touched[list.id] = result.list
            warnings += result.warnings
            appliedChanges.getOrPut(list.id) { mutableListOf() } += change
        }

        private fun find(listId: ListId): ShoppingList? = touched[listId] ?: lists.findById(spaceId, listId)

        /** Warnings with list and user names resolved for display. */
        fun warningViews(): List<WarningView> = warnings.map { warning ->
            val by = when (warning) {
                is MergeWarning.Overwritten -> warning.by
                is MergeWarning.Restored -> warning.deletedBy
                is MergeWarning.DeleteSkipped -> warning.changedBy
                is MergeWarning.ListGone -> null
            }
            WarningView(warning, find(warning.listId)?.name, by?.let { users.findById(it)?.displayName })
        }

        /** Returns the highest purged tombstone seq (0 = none), see [ListStore.saveWithoutPurgeRecord]. */
        fun saveTouchedLists(): Long = touched.values.maxOfOrNull { list ->
            val purgedSeq = store.saveWithoutPurgeRecord(list)
            catalog.recordItemChanges(spaceId, list, appliedChanges[list.id].orEmpty(), context.seq)
            purgedSeq
        } ?: 0
    }

    companion object {
        const val MAX_BATCH = 500
        private val REMEMBER_CHANGES: Duration = Duration.ofDays(30)
    }
}
