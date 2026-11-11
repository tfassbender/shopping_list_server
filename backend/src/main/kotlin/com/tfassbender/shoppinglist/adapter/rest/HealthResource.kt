package com.tfassbender.shoppinglist.adapter.rest

import jakarta.ws.rs.GET
import jakarta.ws.rs.Path
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.config.inject.ConfigProperty
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.tags.Tag

data class HealthResponse(
    val status: String,
    val version: String,
)

/** Liveness check for clients (e.g. the web app's connection indicator). */
@Path("/api/health")
@Produces(MediaType.APPLICATION_JSON)
@Tag(name = "System")
class HealthResource(
    @param:ConfigProperty(name = "shoppinglist.info.version")
    private val version: String,
) {

    @GET
    @Operation(operationId = "getHealth", summary = "Check that the server is up and return its version")
    fun health(): HealthResponse = HealthResponse(status = "UP", version = version)
}
