package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.space.CatalogService
import com.tfassbender.shoppinglist.domain.list.CategoryId
import com.tfassbender.shoppinglist.domain.space.HistoryEntry
import com.tfassbender.shoppinglist.domain.space.SpaceCatalog
import com.tfassbender.shoppinglist.domain.space.SpaceId
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.Consumes
import jakarta.ws.rs.DELETE
import jakarta.ws.rs.DefaultValue
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.PUT
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.QueryParam
import jakarta.ws.rs.core.MediaType
import java.time.Instant
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Content
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse
import org.eclipse.microprofile.openapi.annotations.tags.Tag
import org.jboss.resteasy.reactive.ResponseStatus

data class CategoryRequest(
    val name: String = "",
    @field:Schema(description = "Color as #RRGGBB", example = "#4caf50")
    val color: String = "",
    @field:Schema(description = "Optional client-generated id")
    val id: String? = null,
)

data class OrderRequest(val ids: List<String> = emptyList())
data class UnitsRequest(val units: List<String> = emptyList())

data class CategoryDto(val id: String, val name: String, val color: String)

data class CatalogDto(
    val categories: List<CategoryDto>,
    val units: List<String>,
    @field:Schema(description = "How often each item was bought (normalized lowercase name -> count); for client-side sorting. Derived from `history`")
    val usage: Map<String, Int> = emptyMap(),
    @field:Schema(description = "The complete item history (alphabetically), so clients can rank suggestions offline like `getSuggestions`")
    val history: List<HistoryEntryDto> = emptyList(),
) {
    companion object {
        fun from(catalog: SpaceCatalog) = CatalogDto(
            catalog.categories.map { CategoryDto(it.id.value, it.name, it.color) },
            catalog.units,
            catalog.history.filterValues { it.usageCount > 0 }.mapValues { it.value.usageCount },
            catalog.historyEntries().map(HistoryEntryDto::from),
        )
    }
}

data class SuggestionDto(val name: String, val categoryId: String?, val unit: String?, val usageCount: Int) {
    companion object {
        fun from(entry: HistoryEntry) = SuggestionDto(entry.name, entry.categoryId?.value, entry.unit, entry.usageCount)
    }
}

data class HistoryEntryDto(val name: String, val categoryId: String?, val unit: String?, val usageCount: Int, val lastUsed: Instant) {
    companion object {
        fun from(entry: HistoryEntry) = HistoryEntryDto(entry.name, entry.categoryId?.value, entry.unit, entry.usageCount, entry.lastUsed)
    }
}

/** Item names are passed as query parameter (they may contain '/'); without one nothing matches. */
const val ITEM_NAME_DESCRIPTION = "The item name (case-insensitive)"

data class RenameHistoryRequest(
    @field:Schema(description = "The new name; if it is already remembered, both entries are merged")
    val name: String = "",
)

/** Categories (ordered, colored), units and the item history of a space. Every member may edit them. */
@Path("/api/spaces/{spaceId}/catalog")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Catalog", description = "Categories, units and autocomplete suggestions of a space")
class CatalogResource(
    private val catalogService: CatalogService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "getCatalog", summary = "Categories (in order), units and item history of a space")
    fun get(@PathParam("spaceId") spaceId: String) = CatalogDto.from(catalogService.get(currentUser.id(), SpaceId(spaceId)))

    @POST
    @Path("/categories")
    @Operation(operationId = "addCategory", summary = "Add a category at the end")
    @ResponseStatus(201)
    @APIResponse(responseCode = "201", description = "Created", content = [Content(schema = Schema(implementation = CatalogDto::class))])
    fun addCategory(@PathParam("spaceId") spaceId: String, request: CategoryRequest): CatalogDto {
        val catalog = catalogService.addCategory(
            currentUser.id(), SpaceId(spaceId), request.name, request.color, request.id?.let(::CategoryId),
        )
        return CatalogDto.from(catalog)
    }

    @PUT
    @Path("/categories/{categoryId}")
    @Operation(operationId = "updateCategory", summary = "Rename / recolor a category")
    fun updateCategory(@PathParam("spaceId") spaceId: String, @PathParam("categoryId") categoryId: String, request: CategoryRequest) =
        CatalogDto.from(catalogService.updateCategory(currentUser.id(), SpaceId(spaceId), CategoryId(categoryId), request.name, request.color))

    @DELETE
    @Path("/categories/{categoryId}")
    @Operation(operationId = "deleteCategory", summary = "Delete a category; its items become uncategorized")
    fun deleteCategory(@PathParam("spaceId") spaceId: String, @PathParam("categoryId") categoryId: String) =
        CatalogDto.from(catalogService.deleteCategory(currentUser.id(), SpaceId(spaceId), CategoryId(categoryId)))

    @PUT
    @Path("/categories/order")
    @Operation(operationId = "reorderCategories", summary = "Set the category order (all category ids)")
    fun reorder(@PathParam("spaceId") spaceId: String, request: OrderRequest) =
        CatalogDto.from(catalogService.reorderCategories(currentUser.id(), SpaceId(spaceId), request.ids.map(::CategoryId)))

    @PUT
    @Path("/units")
    @Operation(operationId = "setUnits", summary = "Replace the list of units")
    fun setUnits(@PathParam("spaceId") spaceId: String, request: UnitsRequest) =
        CatalogDto.from(catalogService.setUnits(currentUser.id(), SpaceId(spaceId), request.units))

    @GET
    @Path("/suggestions")
    @Operation(
        operationId = "getSuggestions",
        summary = "Autocomplete from the item history: prefix matches, most used first, with last category/unit",
        description = "Ranking (clients mirror it offline with `CatalogDto.history`): names are compared normalized " +
            "(trimmed, lowercase, runs of whitespace as one space). An entry matches if its name or one of its " +
            "space-separated words starts with the query. Order: names starting with the query first, then by " +
            "usageCount (descending), lastUsed (newest first) and name (case-insensitive). A blank query gives no suggestions.",
    )
    fun suggestions(
        @PathParam("spaceId") spaceId: String,
        @QueryParam("q") @Parameter(required = false) query: String?,
        @QueryParam("limit") @DefaultValue("8") @Parameter(required = false) limit: Int,
    ): List<SuggestionDto> =
        catalogService.suggestions(currentUser.id(), SpaceId(spaceId), query ?: "", limit).map(SuggestionDto::from)

    // The history is addressed by item name (case-insensitive) as query parameter: names may contain '/'.

    @GET
    @Path("/history")
    @Operation(operationId = "getItemHistory", summary = "All items used before in this space (source of the suggestions), alphabetically")
    fun history(@PathParam("spaceId") spaceId: String): List<HistoryEntryDto> =
        catalogService.history(currentUser.id(), SpaceId(spaceId)).map(HistoryEntryDto::from)

    @PUT
    @Path("/history")
    @Operation(operationId = "renameHistoryItem", summary = "Rename an item of the history (merged if the new name exists); returns the history")
    fun renameHistory(
        @PathParam("spaceId") spaceId: String,
        @QueryParam("name") @Parameter(required = true, description = ITEM_NAME_DESCRIPTION) name: String?,
        request: RenameHistoryRequest,
    ): List<HistoryEntryDto> =
        catalogService.renameHistory(currentUser.id(), SpaceId(spaceId), name ?: "", request.name).map(HistoryEntryDto::from)

    @DELETE
    @Path("/history")
    @Operation(operationId = "removeHistoryItem", summary = "Forget an item of the history (no longer suggested); returns the history")
    fun removeHistory(
        @PathParam("spaceId") spaceId: String,
        @QueryParam("name") @Parameter(required = true, description = ITEM_NAME_DESCRIPTION) name: String?,
    ): List<HistoryEntryDto> =
        catalogService.removeHistory(currentUser.id(), SpaceId(spaceId), name ?: "").map(HistoryEntryDto::from)
}
