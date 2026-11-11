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
import jakarta.ws.rs.core.Response
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.media.Schema
import org.eclipse.microprofile.openapi.annotations.tags.Tag

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

data class CatalogDto(val categories: List<CategoryDto>, val units: List<String>) {
    companion object {
        fun from(catalog: SpaceCatalog) = CatalogDto(
            catalog.categories.map { CategoryDto(it.id.value, it.name, it.color) },
            catalog.units,
        )
    }
}

data class SuggestionDto(val name: String, val categoryId: String?, val unit: String?, val usageCount: Int) {
    companion object {
        fun from(entry: HistoryEntry) = SuggestionDto(entry.name, entry.categoryId?.value, entry.unit, entry.usageCount)
    }
}

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
    @Operation(operationId = "getCatalog", summary = "Categories (in order) and units of a space")
    fun get(@PathParam("spaceId") spaceId: String) = CatalogDto.from(catalogService.get(currentUser.id(), SpaceId(spaceId)))

    @POST
    @Path("/categories")
    @Operation(operationId = "addCategory", summary = "Add a category at the end")
    fun addCategory(@PathParam("spaceId") spaceId: String, request: CategoryRequest): Response {
        val catalog = catalogService.addCategory(
            currentUser.id(), SpaceId(spaceId), request.name, request.color, request.id?.let(::CategoryId),
        )
        return Response.status(Response.Status.CREATED).entity(CatalogDto.from(catalog)).build()
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
    )
    fun suggestions(
        @PathParam("spaceId") spaceId: String,
        @QueryParam("q") query: String?,
        @QueryParam("limit") @DefaultValue("8") limit: Int,
    ): List<SuggestionDto> =
        catalogService.suggestions(currentUser.id(), SpaceId(spaceId), query ?: "", limit).map(SuggestionDto::from)
}
