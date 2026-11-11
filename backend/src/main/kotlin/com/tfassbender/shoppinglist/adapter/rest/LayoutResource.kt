package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.list.LayoutService
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.list.LayoutId
import com.tfassbender.shoppinglist.domain.list.LayoutMode
import com.tfassbender.shoppinglist.domain.list.ListId
import com.tfassbender.shoppinglist.domain.list.ShopLayout
import com.tfassbender.shoppinglist.domain.space.SpaceId
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.ResponseStatus
import java.time.Instant

data class CreateLayoutRequest(
    val name: String = "",
    val mode: LayoutMode = LayoutMode.CATEGORIES,
    @field:Schema(description = "Optional client-generated id")
    val id: String? = null,
)

data class UpdateLayoutRequest(val name: String = "", val mode: LayoutMode = LayoutMode.CATEGORIES)

@Schema(description = "Complete new order. CATEGORIES: category ids; ITEMS: item names (case-insensitive)")
data class EntriesRequest(val entries: List<String> = emptyList())

data class FavoriteRequest(val name: String = "")

data class LayoutDto(
    val id: String,
    val name: String,
    val mode: LayoutMode,
    val categoryOrder: List<String>,
    val itemOrder: List<String>,
    val listIds: List<String>,
    val createdAt: Instant,
) {
    companion object {
        fun from(layout: ShopLayout) = LayoutDto(
            layout.id.value,
            layout.name,
            layout.mode,
            layout.categoryOrder.map { it.value },
            layout.itemOrder,
            layout.listIds.map { it.value }.sorted(),
            layout.createdAt,
        )
    }
}

data class FavoritesDto(val names: List<String>)

/**
 * Shop layouts: the walking order through a shop, by categories or by single items. Used to sort lists
 * (`GET .../lists/{listId}?sort=<layoutId>`). Favorites are personal per user and layout.
 */
@Path("/api/spaces/{spaceId}/layouts")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Layouts", description = "Shop layouts for sorting lists, and personal favorites")
class LayoutResource(
    private val layoutService: LayoutService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "listLayouts", summary = "Layouts of a space")
    fun list(@PathParam("spaceId") spaceId: String): List<LayoutDto> =
        layoutService.layouts(currentUser.id(), SpaceId(spaceId)).map(LayoutDto::from)

    @POST
    @Operation(operationId = "createLayout", summary = "Create a layout (starts with the space's category order)")
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = LayoutDto::class))])
    fun create(@PathParam("spaceId") spaceId: String, request: CreateLayoutRequest): LayoutDto {
        val layout = layoutService.create(currentUser.id(), SpaceId(spaceId), request.name, request.mode, request.id?.let(::LayoutId))
        return LayoutDto.from(layout)
    }

    @GET
    @Path("/{layoutId}")
    @Operation(operationId = "getLayout", summary = "A layout")
    fun get(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String) =
        LayoutDto.from(layoutService.get(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId)))

    @PUT
    @Path("/{layoutId}")
    @Operation(operationId = "updateLayout", summary = "Rename a layout / switch its mode")
    fun update(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, request: UpdateLayoutRequest) =
        LayoutDto.from(layoutService.update(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), request.name, request.mode))

    @DELETE
    @Path("/{layoutId}")
    @Operation(operationId = "deleteLayout", summary = "Delete a layout")
    fun delete(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String) {
        layoutService.delete(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId))
    }

    @PUT
    @Path("/{layoutId}/category-order")
    @Operation(operationId = "setLayoutCategoryOrder", summary = "Set the category order (mode CATEGORIES)")
    fun setCategoryOrder(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, request: EntriesRequest) =
        LayoutDto.from(layoutService.setCategoryOrder(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), request.entries.map(::CategoryId)))

    @PUT
    @Path("/{layoutId}/item-order")
    @Operation(operationId = "setLayoutItemOrder", summary = "Set the item order by names (mode ITEMS)")
    fun setItemOrder(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, request: EntriesRequest) =
        LayoutDto.from(layoutService.setItemOrder(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), request.entries))

    @PUT
    @Path("/{layoutId}/lists/{listId}")
    @Operation(operationId = "connectLayoutToList", summary = "Connect a list (offered as shop on that list)")
    fun connect(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, @PathParam("listId") listId: String) =
        LayoutDto.from(layoutService.connectList(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), ListId(listId)))

    @DELETE
    @Path("/{layoutId}/lists/{listId}")
    @Operation(operationId = "disconnectLayoutFromList", summary = "Disconnect a list")
    fun disconnect(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, @PathParam("listId") listId: String) =
        LayoutDto.from(layoutService.disconnectList(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), ListId(listId)))

    @GET
    @Path("/{layoutId}/favorites")
    @Operation(operationId = "getFavorites", summary = "The caller's favorite item names in this layout")
    fun favorites(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String) =
        FavoritesDto(layoutService.favorites(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId)).sorted())

    @POST
    @Path("/{layoutId}/favorites")
    @Operation(operationId = "addFavorite", summary = "Mark an item name as personal favorite in this layout")
    fun addFavorite(@PathParam("spaceId") spaceId: String, @PathParam("layoutId") layoutId: String, request: FavoriteRequest) =
        FavoritesDto(layoutService.addFavorite(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), request.name).sorted())

    @DELETE
    @Path("/{layoutId}/favorites")
    @Operation(operationId = "removeFavorite", summary = "Remove a personal favorite (name as query parameter)")
    fun removeFavorite(
        @PathParam("spaceId") spaceId: String,
        @PathParam("layoutId") layoutId: String,
        @QueryParam("name") @Parameter(required = false, description = ITEM_NAME_DESCRIPTION) name: String?,
    ) =
        FavoritesDto(layoutService.removeFavorite(currentUser.id(), SpaceId(spaceId), LayoutId(layoutId), name ?: "").sorted())
}
