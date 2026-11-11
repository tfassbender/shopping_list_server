package com.tfassbender.shoppinglist.adapter.rest

import com.fasterxml.jackson.databind.JsonNode
import com.tfassbender.shoppinglist.application.list.LayoutService
import com.tfassbender.shoppinglist.application.list.ShoppingListService
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.Item
import com.tfassbender.shoppinglist.domain.list.ItemField
import com.tfassbender.shoppinglist.domain.list.ItemId
import com.tfassbender.shoppinglist.domain.list.ItemSorter
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.ListChange
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShoppingList
import com.tfassbender.shoppinglist.domain.space.SpaceId
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.PATCH
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter
import org.eclipse.microprofile.openapi.annotations.parameters.RequestBody
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import java.time.Instant

data class CreateListRequest(
    val name: String = "",
    @field:Schema(description = "Optional client-generated id (UUID), e.g. for lists created offline")
    val id: String? = null,
)

data class AddItemRequest(
    val name: String = "",
    @field:Schema(description = "Optional client-generated id (UUID)")
    val id: String? = null,
    val quantity: String? = null,
    val unit: String? = null,
    val note: String? = null,
    val categoryId: String? = null,
)

@Schema(description = "Fields to change. A missing field stays unchanged; null or \"\" clears an optional field.")
data class EditItemRequest(
    val name: String? = null,
    val quantity: String? = null,
    val unit: String? = null,
    val note: String? = null,
    val categoryId: String? = null,
)

data class ItemDto(
    val id: String,
    val name: String,
    val quantity: String?,
    val unit: String?,
    val note: String?,
    val categoryId: String?,
    val checked: Boolean,
    val createdAt: Instant,
    val seq: Long,
    @field:Schema(description = "Personal favorite in the layout given as `sort` (always false without `sort`)")
    val favorite: Boolean = false,
) {
    companion object {
        fun from(item: Item, favorite: Boolean = false) = ItemDto(
            item.id.value, item.name, item.quantity, item.unit, item.note, item.categoryId?.value,
            item.checked, item.createdAt, item.seq, favorite,
        )
    }
}

data class ListDto(
    val id: String,
    val spaceId: String,
    val name: String,
    val createdAt: Instant,
    val seq: Long,
    val items: List<ItemDto>,
    @field:Schema(description = "Layout id the items are sorted by, null = order of adding")
    val sortedBy: String? = null,
) {
    companion object {
        fun from(list: ShoppingList, sorted: List<ItemSorter.SortedItem>? = null, sortedBy: String? = null) = ListDto(
            list.id.value, list.spaceId.value, list.name, list.createdAt, list.seq,
            sorted?.map { ItemDto.from(it.item, it.favorite) } ?: list.activeItems.map { ItemDto.from(it) },
            sortedBy,
        )
    }
}

data class ListSummaryDto(val id: String, val name: String, val openItems: Int, val checkedItems: Int, val seq: Long) {
    companion object {
        fun from(list: ShoppingList) = ListSummaryDto(
            list.id.value, list.name, list.activeItems.count { !it.checked }, list.activeItems.count { it.checked }, list.seq,
        )
    }
}

/**
 * Lists and items of a space. Every item mutation returns the complete updated list, so clients can
 * simply replace their copy. Deleted items are not included (they are tombstones for the sync).
 * The optional `sort=<layoutId>` parameter (on all endpoints returning a list) sorts the items for a
 * shop: layout order, the caller's favorites, most bought, name; checked items last if the caller wants.
 */
@Path("/api/spaces/{spaceId}/lists")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Lists", description = "Shopping lists and their items")
class ListResource(
    private val listService: ShoppingListService,
    private val layoutService: LayoutService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "listLists", summary = "Lists of a space with item counts")
    fun lists(@PathParam("spaceId") spaceId: String): List<ListSummaryDto> =
        listService.lists(currentUser.id(), SpaceId(spaceId)).map(ListSummaryDto::from)

    @POST
    @Operation(operationId = "createList", summary = "Create a list in a space")
    fun create(@PathParam("spaceId") spaceId: String, request: CreateListRequest): Response {
        val list = listService.create(currentUser.id(), SpaceId(spaceId), request.name, request.id?.let(::ListId))
        return Response.status(Response.Status.CREATED).entity(ListDto.from(list)).build()
    }

    @GET
    @Path("/{listId}")
    @Operation(operationId = "getList", summary = "A list with its items")
    fun get(@PathParam("spaceId") spaceId: String, @PathParam("listId") listId: String, @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?) =
        toDto(listService.get(currentUser.id(), SpaceId(spaceId), ListId(listId)), sort)

    @PUT
    @Path("/{listId}/name")
    @Operation(operationId = "renameList", summary = "Rename a list")
    fun rename(@PathParam("spaceId") spaceId: String, @PathParam("listId") listId: String, @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?, request: NameRequest) =
        change(spaceId, listId, sort, ListChange.RenameList(request.name))

    @DELETE
    @Path("/{listId}")
    @Operation(operationId = "deleteList", summary = "Delete a list (owner of the space only)")
    fun delete(@PathParam("spaceId") spaceId: String, @PathParam("listId") listId: String): Response {
        listService.delete(currentUser.id(), SpaceId(spaceId), ListId(listId))
        return Response.noContent().build()
    }

    @POST
    @Path("/{listId}/items")
    @Operation(operationId = "addItem", summary = "Add an item")
    fun addItem(@PathParam("spaceId") spaceId: String, @PathParam("listId") listId: String, @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?, request: AddItemRequest): Response {
        val change = ListChange.AddItem(
            itemId = ItemId(request.id ?: java.util.UUID.randomUUID().toString()),
            name = request.name,
            quantity = request.quantity,
            unit = request.unit,
            note = request.note,
            categoryId = request.categoryId?.takeIf { it.isNotBlank() }?.let(::CategoryId),
        )
        return Response.status(Response.Status.CREATED).entity(change(spaceId, listId, sort, change)).build()
    }

    @PATCH
    @Path("/{listId}/items/{itemId}")
    @Operation(operationId = "editItem", summary = "Change fields of an item")
    @RequestBody(content = [Content(schema = Schema(implementation = EditItemRequest::class))])
    fun editItem(
        @PathParam("spaceId") spaceId: String,
        @PathParam("listId") listId: String,
        @PathParam("itemId") itemId: String,
        @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?,
        body: JsonNode,
    ): ListDto {
        val id = ItemId(itemId)
        val changes = EDITABLE_FIELDS.filter { (json, _) -> body.has(json) }.map { (json, field) ->
            val value = body.get(json)
            ListChange.EditItem(id, field, if (value.isNull) null else value.asText())
        }
        require(changes.isNotEmpty()) { "No editable field given" }
        return toDto(listService.applyChanges(currentUser.id(), SpaceId(spaceId), ListId(listId), changes), sort)
    }

    @POST
    @Path("/{listId}/items/{itemId}/check")
    @Operation(operationId = "checkItem", summary = "Check off an item")
    fun check(
        @PathParam("spaceId") spaceId: String,
        @PathParam("listId") listId: String,
        @PathParam("itemId") itemId: String,
        @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?,
    ) = change(spaceId, listId, sort, ListChange.CheckItem(ItemId(itemId)))

    @POST
    @Path("/{listId}/items/{itemId}/uncheck")
    @Operation(operationId = "uncheckItem", summary = "Un-check an item")
    fun uncheck(
        @PathParam("spaceId") spaceId: String,
        @PathParam("listId") listId: String,
        @PathParam("itemId") itemId: String,
        @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?,
    ) = change(spaceId, listId, sort, ListChange.UncheckItem(ItemId(itemId)))

    @DELETE
    @Path("/{listId}/items/{itemId}")
    @Operation(operationId = "deleteItem", summary = "Delete an item")
    fun deleteItem(
        @PathParam("spaceId") spaceId: String,
        @PathParam("listId") listId: String,
        @PathParam("itemId") itemId: String,
        @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?,
    ) = change(spaceId, listId, sort, ListChange.DeleteItem(ItemId(itemId)))

    @POST
    @Path("/{listId}/remove-checked")
    @Operation(operationId = "removeCheckedItems", summary = "Remove all checked items")
    fun removeChecked(@PathParam("spaceId") spaceId: String, @PathParam("listId") listId: String, @QueryParam("sort") @Parameter(description = SORT_DESCRIPTION) sort: String?) =
        change(spaceId, listId, sort, ListChange.RemoveChecked())

    private fun change(spaceId: String, listId: String, sort: String?, change: ListChange): ListDto =
        toDto(listService.apply(currentUser.id(), SpaceId(spaceId), ListId(listId), change), sort)

    private fun toDto(list: ShoppingList, sort: String?): ListDto {
        val layoutId = sort?.takeIf { it.isNotBlank() }?.let(::LayoutId) ?: return ListDto.from(list)
        return ListDto.from(list, layoutService.sort(currentUser.id(), list, layoutId), layoutId.value)
    }

    private companion object {
        const val SORT_DESCRIPTION = "Optional layout id: sort the items for this shop"
        val EDITABLE_FIELDS = listOf(
            "name" to ItemField.NAME,
            "quantity" to ItemField.QUANTITY,
            "unit" to ItemField.UNIT,
            "note" to ItemField.NOTE,
            "categoryId" to ItemField.CATEGORY,
        )
    }
}
