package com.tfassbender.shoppinglist.adapter.rest

import com.tfassbender.shoppinglist.application.space.SpaceService
import jakarta.annotation.security.RolesAllowed
import jakarta.ws.rs.GET
import jakarta.ws.rs.POST
import jakarta.ws.rs.Path
import jakarta.ws.rs.PathParam
import jakarta.ws.rs.Produces
import jakarta.ws.rs.core.MediaType
import org.eclipse.microprofile.openapi.annotations.Operation
import org.eclipse.microprofile.openapi.annotations.tags.Tag

data class InvitePreviewDto(val spaceName: String, val invitedBy: String, val alreadyMember: Boolean)

/** Invite acceptance by the invited (logged-in) user. The token comes from the invite link. */
@Path("/api/invites/{token}")
@Produces(MediaType.APPLICATION_JSON)
@RolesAllowed(USER_ROLE)
@Tag(name = "Spaces")
class InviteResource(
    private val spaceService: SpaceService,
    private val currentUser: CurrentUser,
) {

    @GET
    @Operation(operationId = "previewInvite", summary = "Space name and inviter of an invite link")
    fun preview(@PathParam("token") token: String): InvitePreviewDto {
        val preview = spaceService.previewInvite(currentUser.id(), token)
        return InvitePreviewDto(preview.spaceName, preview.invitedBy, preview.alreadyMember)
    }

    @POST
    @Path("/accept")
    @Operation(operationId = "acceptInvite", summary = "Join the space of an invite link (single-use)")
    fun accept(@PathParam("token") token: String): SpaceDto {
        val me = currentUser.id()
        return SpaceDto.from(spaceService.acceptInvite(me, token), me)
    }
}
