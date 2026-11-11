package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.list.ChangeResult
import com.tfassbender.shoppinglist.application.list.ChangeStatus
import com.tfassbender.shoppinglist.application.list.SyncOperation
import com.tfassbender.shoppinglist.application.list.SyncService
import com.tfassbender.shoppinglist.application.list.WarningView
import com.tfassbender.shoppinglist.domain.DomainException
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.Item
import com.tfassbender.shoppinglist.domain.list.ItemAspect
import com.tfassbender.shoppinglist.domain.list.ItemField
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.MergeWarning
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import java.time.Instant

enum class SyncChangeType { CREATE_LIST, RENAME_LIST, ADD_ITEM, EDIT_ITEM, CHECK_ITEM, UNCHECK_ITEM, DELETE_ITEM, REMOVE_CHECKED }

@Schema(description = "One offline change. Required fields depend on `type`.")
data class SyncChangeDto(
    @field:Schema(description = "Client-generated unique id; resending the same id is a no-op")
    val changeId: String = "",
    val type: SyncChangeType? = null,
    val listId: String = "",
    @field:Schema(description = "ADD_ITEM (client-generated), EDIT/CHECK/UNCHECK/DELETE_ITEM")
    val itemId: String? = null,
    @field:Schema(description = "CREATE_LIST, RENAME_LIST, ADD_ITEM")
    val name: String? = null,
    val quantity: String? = null,
    val unit: String? = null,
    val note: String? = null,
    val categoryId: String? = null,
    @field:Schema(description = "EDIT_ITEM: the field to set")
    val field: ItemField? = null,
    @field:Schema(description = "EDIT_ITEM: the new value (null/empty clears optional fields)")
    val value: String? = null,
    @field:Schema(description = "REMOVE_CHECKED: the items that were checked on the client; null = all checked now")
    val itemIds: List<String>? = null,
)

data class PushRequest(
    @field:Schema(description = "The `seq` of the client's last pull; used to detect concurrent changes of others")
    val baseSeq: Long? = null,
    val changes: List<SyncChangeDto> = emptyList(),
)

data class ChangeResultDto(val changeId: String, val status: ChangeStatus, val code: String?)

enum class WarningType { OVERWRITTEN, RESTORED, DELETE_SKIPPED, LIST_DELETED }

@Schema(description = "What the merge did: e.g. 'Anna had set the quantity of Milk to 3; your change set it to 2'")
data class WarningDto(
    val type: WarningType,
    val listId: String,
    val listName: String?,
    val itemId: String?,
    val itemName: String?,
    @field:Schema(description = "OVERWRITTEN: the changed aspect (NAME with itemId null = list name)")
    val field: ItemAspect?,
    val theirValue: String?,
    val yourValue: String?,
    val byName: String?,
)

data class PushResponse(val seq: Long, val results: List<ChangeResultDto>, val warnings: List<WarningDto>)

data class SyncItemDto(
    val id: String,
    val name: String,
    val quantity: String?,
    val unit: String?,
    val note: String?,
    val categoryId: String?,
    val checked: Boolean,
    val deleted: Boolean,
    val createdAt: Instant,
    val seq: Long,
) {
    companion object {
        fun from(item: Item) = SyncItemDto(
            item.id.value, item.name, item.quantity, item.unit, item.note, item.categoryId?.value,
            item.checked, item.deleted, item.createdAt, item.seq,
        )
    }
}

data class SyncListDto(val id: String, val name: String, val createdAt: Instant, val seq: Long, val deleted: Boolean, val items: List<SyncItemDto>) {
    companion object {
        fun from(list: ShoppingList) = SyncListDto(list.id.value, list.name, list.createdAt, list.seq, list.deleted, list.items.map(SyncItemDto::from))
    }
}

data class PullResponse(
    val seq: Long,
    @field:Schema(description = "true: `lists` is the complete state - drop everything local that isn't in it")
    val fullResync: Boolean,
    @field:Schema(description = "Changed lists with their changed items, including deleted ones (tombstones)")
    val lists: List<SyncListDto>,
    @field:Schema(description = "Ids of all existing lists")
    val listIds: List<String>,
    @field:Schema(
        description = "The complete catalog (categories, units, usage, history), only if categories/units changed or " +
            "history entries were removed or renamed - replace the local catalog including its history",
    )
    val catalog: CatalogDto?,
    @field:Schema(
        description = "History entries added or updated since `since` (e.g. items added or checked); empty if `catalog` " +
            "is sent. Merge into the local history by normalized name and update `usage` from their usageCount",
    )
    val historyChanges: List<HistoryEntryDto>,
    @field:Schema(description = "All layouts, only if one changed")
    val layouts: List<LayoutDto>?,
    val layoutIds: List<String>,
    @field:Schema(
        description = "The caller's personal favorites (layout id -> normalized item names, sorted), always complete; " +
            "layouts without favorites are left out",
    )
    val favorites: Map<String, List<String>>,
)

/**
 * Offline sync: push a batch of changes made offline, pull everything changed since a sequence number.
 * Typical client loop: push queued changes (with `baseSeq` = last pulled seq), then pull with `since`.
 */
@Path("/api/spaces/{spaceId}/changes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Sync", description = "Offline sync: batches of changes and changes since a sequence number")
class SyncResource(
    private val syncService: SyncService,
    private val currentUser: CurrentUser,
) {

    @POST
    @Operation(
        operationId = "pushChanges",
        summary = "Apply a batch of offline changes (idempotent by changeId) and return merge warnings",
    )
    fun push(@PathParam("spaceId") spaceId: String, request: PushRequest): PushResponse {
        val invalid = mutableListOf<ChangeResult>()
        val operations = request.changes.mapNotNull { dto ->
            try {
                toOperation(dto)
            } catch (e: DomainException) {
                invalid += ChangeResult(dto.changeId, ChangeStatus.REJECTED, e.code)
                null
            } catch (_: IllegalArgumentException) {
                invalid += ChangeResult(dto.changeId, ChangeStatus.REJECTED, "INVALID_CHANGE")
                null
            }
        }
        val result = syncService.push(currentUser.id(), SpaceId(spaceId), request.baseSeq, operations)
        return PushResponse(
            seq = result.seq,
            results = (result.results + invalid).map { ChangeResultDto(it.changeId, it.status, it.code) },
            warnings = result.warnings.map(::toDto),
        )
    }

    @GET
    @Operation(operationId = "pullChanges", summary = "Everything changed since `since` (0 = full state)")
    fun pull(@PathParam("spaceId") spaceId: String, @QueryParam("since") @DefaultValue("0") since: Long): PullResponse {
        val result = syncService.pull(currentUser.id(), SpaceId(spaceId), since)
        return PullResponse(
            seq = result.seq,
            fullResync = result.fullResync,
            lists = result.lists.map(SyncListDto::from),
            listIds = result.listIds.map { it.value },
            catalog = result.catalog?.let(CatalogDto::from),
            historyChanges = result.historyChanges.map(HistoryEntryDto::from),
            layouts = result.layouts?.map(LayoutDto::from),
            layoutIds = result.layoutIds,
            favorites = result.favorites.entries.associate { (layoutId, names) -> layoutId.value to names.sorted() },
        )
    }

    private fun toOperation(dto: SyncChangeDto): SyncOperation {
        require(dto.changeId.isNotBlank() && dto.changeId.length <= 64) { "Invalid changeId" }
        val listId = ListId(dto.listId)
        val type = requireNotNull(dto.type) { "type missing" }
        if (type == SyncChangeType.CREATE_LIST) return SyncOperation.CreateList(dto.changeId, listId, requireNotNull(dto.name))
        return SyncOperation.ChangeList(dto.changeId, listId, toChange(type, dto))
    }

    private fun toChange(type: SyncChangeType, dto: SyncChangeDto): ListChange {
        val itemId by lazy { ItemId(requireNotNull(dto.itemId) { "itemId missing" }) }
        return when (type) {
            SyncChangeType.RENAME_LIST -> ListChange.RenameList(requireNotNull(dto.name))
            SyncChangeType.ADD_ITEM -> ListChange.AddItem(
                itemId, requireNotNull(dto.name), dto.quantity, dto.unit, dto.note,
                dto.categoryId?.takeIf { it.isNotBlank() }?.let(::CategoryId),
            )
            SyncChangeType.EDIT_ITEM -> ListChange.EditItem(itemId, requireNotNull(dto.field), dto.value)
            SyncChangeType.CHECK_ITEM -> ListChange.CheckItem(itemId)
            SyncChangeType.UNCHECK_ITEM -> ListChange.UncheckItem(itemId)
            SyncChangeType.DELETE_ITEM -> ListChange.DeleteItem(itemId)
            SyncChangeType.REMOVE_CHECKED -> ListChange.RemoveChecked(dto.itemIds?.map(::ItemId)?.toSet())
            SyncChangeType.CREATE_LIST -> error("handled above")
        }
    }

    private fun toDto(view: WarningView): WarningDto = when (val w = view.warning) {
        is MergeWarning.Overwritten -> WarningDto(
            WarningType.OVERWRITTEN, w.listId.value, view.listName, w.itemId?.value, w.itemName, w.aspect, w.theirValue, w.yourValue, view.byName,
        )
        is MergeWarning.Restored -> WarningDto(WarningType.RESTORED, w.listId.value, view.listName, w.itemId.value, w.itemName, null, null, null, view.byName)
        is MergeWarning.DeleteSkipped -> WarningDto(WarningType.DELETE_SKIPPED, w.listId.value, view.listName, w.itemId.value, w.itemName, null, null, null, view.byName)
        is MergeWarning.ListGone -> WarningDto(WarningType.LIST_DELETED, w.listId.value, w.listName ?: view.listName, null, null, null, null, null, null)
    }
}
